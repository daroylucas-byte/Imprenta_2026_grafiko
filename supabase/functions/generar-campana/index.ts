import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const COSTO_GENERAR_CAMPANA = 600;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    const { campana_id, usuario_id } = await req.json().catch(() => ({ campana_id: null, usuario_id: null }));

    if (!campana_id) {
      return new Response(JSON.stringify({ error: 'Falta campana_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Traer la campaña y el cliente asociado
    const { data: campana, error: campanaError } = await supabase
      .from('t_campanas_cliente')
      .select('*, t_clientes(razon_social)')
      .eq('id', campana_id)
      .single();

    if (campanaError) throw campanaError;
    if (!campana) {
      return new Response(JSON.stringify({ error: 'Campaña no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Traer el análisis de identidad visual del cliente (si existe)
    const { data: identidad } = await supabase
      .from('t_analisis_identidad_cliente')
      .select('estilo_descripcion')
      .eq('cliente_id', campana.cliente_id)
      .maybeSingle();

    // 3. Descontar saldo de forma atómica (wallet compartido de Grafiko)
    const { error: saldoError } = await supabase.rpc('descontar_saldo_marketing', {
      p_monto: COSTO_GENERAR_CAMPANA,
      p_tipo: 'generar_campana',
      p_descripcion: `Plan de campaña "${campana.nombre_campana}" para ${campana.t_clientes?.razon_social || 'cliente'}`,
      p_usuario_id: usuario_id ?? null,
    });

    if (saldoError) {
      return new Response(JSON.stringify({ error: saldoError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Armar el prompt: SOLO resumen + 4 pilares semanales (respuesta chica
    // y confiable). El detalle día-a-día de cada semana se genera después,
    // bajo demanda, con generar-semana-campana.
    const nombreCliente = campana.t_clientes?.razon_social || 'la marca';
    const identidadTexto = identidad?.estilo_descripcion
      ? `Identidad visual y de marca a respetar en el tono y estilo del contenido: ${identidad.estilo_descripcion}`
      : 'No hay un análisis de identidad visual cargado todavía para esta marca: usá un tono profesional y adaptable.';

    const plataformasTexto = Array.isArray(campana.plataformas) && campana.plataformas.length > 0
      ? campana.plataformas.join(', ')
      : 'redes sociales en general';

    const prompt = `
Sos un experto en marketing digital y estrategia de redes sociales, contratado por una agencia
(Grafiko) para planificar una campaña en nombre de su cliente "${nombreCliente}".

${identidadTexto}

Datos de la campaña "${campana.nombre_campana}":
- Período: ${campana.fecha_inicio || 'no especificado'} a ${campana.fecha_fin || 'no especificado'}
- Objetivo: ${campana.objetivo || 'no especificado'}
- Meta que busca el cliente (dato provisto por el cliente, no la inventes ni la cambies): ${campana.meta_cuantificable || 'no especificada'}
- Plataformas objetivo: ${plataformasTexto}
- Público objetivo: ${campana.publico_objetivo || 'no especificado'}
- Contexto adicional: ${campana.contexto_extra || 'ninguno'}

Generá SOLO el plan estratégico de alto nivel dividido en las 4 semanas del mes de campaña,
cada una con un eje temático distinto siguiendo esta progresión estándar de agencia:
Semana 1: Awareness/Introducción, Semana 2: Engagement/Educación,
Semana 3: Conversión/Oferta, Semana 4: Retención/Comunidad
(adaptá el eje si el objetivo de la campaña lo amerita, pero mantené la progresión lógica).

Respondé en español rioplatense, en formato JSON (sin texto adicional, sin markdown), con esta
estructura exacta:
{
  "resumen": "un párrafo breve resumiendo la estrategia general de la campaña",
  "pilares": [
    { "semana": 1, "eje": "nombre corto del eje temático", "enfoque": "1-2 frases describiendo el enfoque y tipo de contenido de esa semana" },
    { "semana": 2, "eje": "...", "enfoque": "..." },
    { "semana": 3, "eje": "...", "enfoque": "..." },
    { "semana": 4, "eje": "...", "enfoque": "..." }
  ]
}
    `.trim();

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Error de Gemini: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleanText = rawText.replace(/```json|```/g, '').trim();
    const plan = JSON.parse(cleanText);

    // 5. Guardar el resumen y los pilares en la campaña
    const { data: updated, error: updateError } = await supabase
      .from('t_campanas_cliente')
      .update({
        pilares_semanales: plan.pilares || [],
        estado: 'activa',
        contexto_extra: campana.contexto_extra
          ? `${campana.contexto_extra}\n\n[Resumen generado por IA]: ${plan.resumen || ''}`
          : `[Resumen generado por IA]: ${plan.resumen || ''}`,
      })
      .eq('id', campana_id)
      .select()
      .single();

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true, campana: updated, resumen: plan.resumen }), {
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
