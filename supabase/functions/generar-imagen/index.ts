import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const COSTO_GENERAR_IMAGEN = 1250;

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
    const { promocion_id, usuario_id } = await req.json().catch(() => ({ promocion_id: null, usuario_id: null }));

    if (!promocion_id) {
      return new Response(JSON.stringify({ error: 'Falta promocion_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Traer la promoción base y el análisis de identidad visual (si existe)
    const [{ data: promo, error: promoError }, { data: identidad }] = await Promise.all([
      supabase.from('t_promociones').select('*').eq('id', promocion_id).single(),
      supabase.from('t_analisis_identidad').select('estilo_descripcion').eq('id', 1).maybeSingle(),
    ]);

    if (promoError) throw promoError;
    if (!promo) {
      return new Response(JSON.stringify({ error: 'Promoción no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Descontar saldo de forma atómica antes de gastar en la llamada a Gemini
    const { error: saldoError } = await supabase.rpc('descontar_saldo_marketing', {
      p_monto: COSTO_GENERAR_IMAGEN,
      p_tipo: 'generar_imagen',
      p_descripcion: `Generación de flyer para: ${promo.titulo}`,
      p_usuario_id: usuario_id ?? null,
    });

    if (saldoError) {
      return new Response(JSON.stringify({ error: saldoError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Armar el prompt combinando la promoción y el estilo de identidad visual.
    // La identidad visual va como bloque de instrucciones de diseño explícitas y en primer
    // lugar (no como un párrafo diluido al final), porque los modelos de imagen priorizan
    // mejor las restricciones de estilo cuando están estructuradas y al principio del prompt.
    const hashtagsTexto = (promo.hashtags || []).join(' ');

    const bloqueIdentidad = identidad?.estilo_descripcion
      ? `
REGLAS DE IDENTIDAD VISUAL DE LA MARCA (obligatorias, son la prioridad #1 del diseño):
${identidad.estilo_descripcion}

Estas reglas de paleta de colores, tipografía y estilo gráfico DEBEN aplicarse literalmente al flyer,
sin importar el tema de la promoción. El tema (la promoción en sí) es el contenido; el estilo de
Grafiko descripto arriba es el envoltorio visual obligatorio.
      `.trim()
      : 'No hay identidad visual analizada todavía para esta marca: usá un estilo profesional, limpio y moderno para una imprenta.';

    const prompt = `
${bloqueIdentidad}

Generá, respetando estrictamente esas reglas de identidad visual, un flyer publicitario cuadrado
(formato post de Instagram) para una imprenta llamada Grafiko, con este contenido:

Título de la promoción: ${promo.titulo}
Descripción: ${promo.descripcion}
Llamada a la acción a incluir en el diseño: ${promo.llamada_accion || ''}
Contexto de hashtags (no los escribas literalmente en la imagen, son solo contexto de tema): ${hashtagsTexto}

El flyer debe tener el texto del título y la llamada a la acción integrados de forma legible y atractiva,
con una composición profesional de diseño gráfico publicitario, no un boceto simple.

REGLAS DE IDIOMA (obligatorias, muy importantes): todo el texto de la imagen debe estar en español
rioplatense/argentino, usando exclusivamente el alfabeto español (incluida la letra "ñ" cuando
corresponda, por ejemplo en palabras como "diseño" o "años"). NO uses letras ni diacríticos de otros
idiomas (nada de tildes tipo portugués "õ"/"ã", diéresis alemanas, ni caracteres de otros alfabetos).
El nombre de la marca se escribe exactamente "Grafiko" (con K, sin tilde ni ningún signo adicional
sobre ninguna letra) — reproducilo tal cual, letra por letra, en el logo y en cualquier mención de la marca.
    `.trim();

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`,
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
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p: any) => p.inlineData?.data);

    if (!imagePart) {
      throw new Error('Gemini no devolvió una imagen en la respuesta');
    }

    const { mimeType, data } = imagePart.inlineData;
    const extension = mimeType.split('/')[1] || 'jpeg';
    const fileName = `flyers/${promocion_id}-${Date.now()}.${extension}`;

    // 4. Subir la imagen generada al bucket público 'marketing'
    const binaryData = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

    const { error: uploadError } = await supabase.storage
      .from('marketing')
      .upload(fileName, binaryData, { contentType: mimeType, upsert: true });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from('marketing').getPublicUrl(fileName);
    const imagenUrl = publicUrlData.publicUrl;

    // 5. Guardar la URL en la promoción
    const { error: updateError } = await supabase
      .from('t_promociones')
      .update({ imagen_url: imagenUrl })
      .eq('id', promocion_id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true, imagen_url: imagenUrl }), {
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
