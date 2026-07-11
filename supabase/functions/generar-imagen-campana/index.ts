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
    const { post_id, usuario_id } = await req.json().catch(() => ({ post_id: null, usuario_id: null }));

    if (!post_id) {
      return new Response(JSON.stringify({ error: 'Falta post_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Traer el post, la campaña y el cliente
    const { data: post, error: postError } = await supabase
      .from('t_campana_posts')
      .select('*, t_campanas_cliente(nombre_campana, cliente_id, t_clientes(razon_social))')
      .eq('id', post_id)
      .single();

    if (postError) throw postError;
    if (!post) {
      return new Response(JSON.stringify({ error: 'Post no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const campana = (post as any).t_campanas_cliente;
    const nombreCliente = campana?.t_clientes?.razon_social || 'la marca';
    const clienteId = campana?.cliente_id;

    // 2. Traer el análisis de identidad visual del cliente
    const { data: identidad } = await supabase
      .from('t_analisis_identidad_cliente')
      .select('estilo_descripcion')
      .eq('cliente_id', clienteId)
      .maybeSingle();

    // 3. Descontar saldo de forma atómica (wallet compartido de Grafiko)
    const { error: saldoError } = await supabase.rpc('descontar_saldo_marketing', {
      p_monto: COSTO_GENERAR_IMAGEN,
      p_tipo: 'generar_imagen_campana',
      p_descripcion: `Imagen de post para ${nombreCliente} (${post.plataforma || 'red social'})`,
      p_usuario_id: usuario_id ?? null,
    });

    if (saldoError) {
      return new Response(JSON.stringify({ error: saldoError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Armar el prompt: identidad de marca como bloque de reglas obligatorias
    // al principio del prompt (mismo patrón validado en el resto del sistema).
    const hashtagsTexto = (post.hashtags || []).join(' ');

    const bloqueIdentidad = identidad?.estilo_descripcion
      ? `
REGLAS DE IDENTIDAD VISUAL DE LA MARCA "${nombreCliente}" (obligatorias, son la prioridad #1 del diseño):
${identidad.estilo_descripcion}

Estas reglas de paleta de colores, tipografía y estilo gráfico DEBEN aplicarse literalmente a la
imagen, sin importar el tema del post. El tema es el contenido; el estilo de "${nombreCliente}"
descripto arriba es el envoltorio visual obligatorio.
      `.trim()
      : `No hay identidad visual analizada todavía para "${nombreCliente}": usá un estilo profesional, limpio y moderno.`;

    const formatoTexto = post.tipo_contenido === 'story' || post.tipo_contenido === 'reel'
      ? 'formato vertical (story/reel, 9:16)'
      : 'formato cuadrado (post de feed, 1:1)';

    const prompt = `
${bloqueIdentidad}

Generá, respetando estrictamente esas reglas de identidad visual, una imagen publicitaria en
${formatoTexto} para ${post.plataforma || 'redes sociales'}, para la marca "${nombreCliente}",
con este contenido:

Hook/título: ${post.hook || post.copy?.slice(0, 80) || ''}
Copy de referencia: ${post.copy || ''}
Llamada a la acción a incluir en el diseño: ${post.cta || ''}
Contexto de hashtags (no los escribas literalmente en la imagen, son solo contexto de tema): ${hashtagsTexto}

La imagen debe tener el texto del hook/título y la llamada a la acción integrados de forma legible
y atractiva, con una composición profesional de diseño gráfico publicitario, no un boceto simple.

REGLAS DE IDIOMA (obligatorias, muy importantes): todo el texto de la imagen debe estar en español
rioplatense/argentino, usando exclusivamente el alfabeto español (incluida la letra "ñ" cuando
corresponda). NO uses letras ni diacríticos de otros idiomas (nada de tildes tipo portugués "õ"/"ã",
diéresis alemanas, ni caracteres de otros alfabetos). Reproducí el nombre de la marca exactamente
como fue escrito arriba, letra por letra, sin agregar ni quitar acentos.
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
    const fileName = `campanas/${post_id}-${Date.now()}.${extension}`;

    // 5. Subir la imagen generada al bucket público 'marketing' (ya existe, reusado)
    const binaryData = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

    const { error: uploadError } = await supabase.storage
      .from('marketing')
      .upload(fileName, binaryData, { contentType: mimeType, upsert: true });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from('marketing').getPublicUrl(fileName);
    const imagenUrl = publicUrlData.publicUrl;

    // 6. Guardar la URL en el post
    const { error: updateError } = await supabase
      .from('t_campana_posts')
      .update({ imagen_url: imagenUrl })
      .eq('id', post_id);

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
