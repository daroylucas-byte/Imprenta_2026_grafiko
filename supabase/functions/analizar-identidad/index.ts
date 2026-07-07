import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const COSTO_ANALIZAR_IDENTIDAD = 500;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function fetchImageAsBase64(url: string): Promise<{ mimeType: string; data: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar la imagen de referencia: ${url}`);
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { mimeType, data: btoa(binary) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { usuario_id } = await req.json().catch(() => ({ usuario_id: null }));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Traer las imágenes de referencia subidas por el usuario
    const { data: imagenes, error: imgError } = await supabase
      .from('t_identidad_visual')
      .select('imagen_url, descripcion')
      .order('created_at', { ascending: false })
      .limit(5);

    if (imgError) throw imgError;
    if (!imagenes || imagenes.length === 0) {
      return new Response(JSON.stringify({ error: 'No hay imágenes de referencia cargadas para analizar' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Descontar saldo de forma atómica antes de gastar en la llamada a Gemini
    const { error: saldoError } = await supabase.rpc('descontar_saldo_marketing', {
      p_monto: COSTO_ANALIZAR_IDENTIDAD,
      p_tipo: 'analizar_identidad',
      p_descripcion: 'Análisis de identidad visual del negocio',
      p_usuario_id: usuario_id ?? null,
    });

    if (saldoError) {
      return new Response(JSON.stringify({ error: saldoError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Descargar las imágenes y armar el request multimodal a Gemini
    const imageParts = await Promise.all(
      imagenes.map(async (img) => {
        const { mimeType, data } = await fetchImageAsBase64(img.imagen_url);
        return { inlineData: { mimeType, data } };
      }),
    );

    const promptText = `
Sos un experto en identidad de marca y diseño gráfico. Analizá estas imágenes de referencia
(logo, flyers anteriores, fotos del local) de una imprenta llamada Grafiko y describí en un
párrafo de texto plano (sin markdown, sin listas) su identidad visual: paleta de colores
predominante (con nombres o códigos hex si podés inferirlos), estilo tipográfico sugerido,
tono general (formal/informal/moderno/clásico) y cualquier elemento gráfico recurrente.
Esta descripción se va a usar como guía de estilo para generar flyers publicitarios nuevos
que sean visualmente consistentes con esta identidad.
    `.trim();

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }, ...imageParts] }],
        }),
      },
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Error de Gemini: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find((p: any) => typeof p.text === 'string');
    const estiloDescripcion = textPart?.text?.trim() || 'No se pudo generar una descripción de estilo.';

    // 4. Guardar el análisis (singleton, se sobreescribe con el más reciente)
    const { error: upsertError } = await supabase
      .from('t_analisis_identidad')
      .upsert({ id: 1, estilo_descripcion: estiloDescripcion, updated_at: new Date().toISOString() });

    if (upsertError) throw upsertError;

    return new Response(JSON.stringify({ ok: true, estilo_descripcion: estiloDescripcion }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
