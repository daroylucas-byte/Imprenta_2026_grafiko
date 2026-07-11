import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const COSTO_GENERAR_SEMANA = 600;

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
    const { campana_id, semana, usuario_id } = await req.json().catch(() => ({ campana_id: null, semana: null, usuario_id: null }));

    if (!campana_id || !semana || semana < 1 || semana > 4) {
      return new Response(JSON.stringify({ error: 'Falta campana_id o semana (debe ser 1-4)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Traer la campaña, el cliente y verificar que ya tenga el plan de pilares generado
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

    const pilares = campana.pilares_semanales || [];
    const pilarSemana = pilares.find((p: any) => p.semana === semana);
    if (!pilarSemana) {
      return new Response(JSON.stringify({ error: 'Esta campaña todavía no tiene el plan de pilares semanales generado. Generá el plan de campaña primero.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Evitar regenerar una semana que ya tiene posts (protección simple)
    const { count: existentes } = await supabase
      .from('t_campana_posts')
      .select('id', { count: 'exact', head: true })
      .eq('campana_id', campana_id)
      .eq('semana', semana);

    if (existentes && existentes > 0) {
      return new Response(JSON.stringify({ error: `La semana ${semana} ya tiene posts generados. Borralos manualmente si querés regenerar.` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Traer identidad visual del cliente
    const { data: identidad } = await supabase
      .from('t_analisis_identidad_cliente')
      .select('estilo_descripcion')
      .eq('cliente_id', campana.cliente_id)
      .maybeSingle();

    // 4. Descontar saldo de forma atómica
    const { error: saldoError } = await supabase.rpc('descontar_saldo_marketing', {
      p_monto: COSTO_GENERAR_SEMANA,
      p_tipo: 'generar_semana_campana',
      p_descripcion: `Semana ${semana} de "${campana.nombre_campana}" (${campana.t_clientes?.razon_social || 'cliente'})`,
      p_usuario_id: usuario_id ?? null,
    });

    if (saldoError) {
      return new Response(JSON.stringify({ error: saldoError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Armar el prompt para los posts de ESTA semana puntual (acotado, no el mes)
    const nombreCliente = campana.t_clientes?.razon_social || 'la marca';
    const identidadTexto = identidad?.estilo_descripcion
      ? `Identidad visual y de marca: ${identidad.estilo_descripcion}`
      : 'No hay identidad visual analizada todavía: usá un tono profesional y adaptable.';

    const plataformas = Array.isArray(campana.plataformas) && campana.plataformas.length > 0
      ? campana.plataformas
      : ['Instagram'];

    const prompt = `
Sos un experto en marketing digital, redactando el calendario de contenido de UNA semana
específica dentro de una campaña de un mes para la marca "${nombreCliente}" (cliente de la
agencia Grafiko).

${identidadTexto}

Campaña: "${campana.nombre_campana}"
Semana ${semana} — Eje temático: "${pilarSemana.eje}"
Enfoque de esta semana: ${pilarSemana.enfoque}
Plataformas a usar: ${plataformas.join(', ')}
Público objetivo: ${campana.publico_objetivo || 'no especificado'}
Contexto adicional de la campaña: ${campana.contexto_extra || 'ninguno'}

Generá entre 5 y 7 posts para distribuir a lo largo de esta semana (lunes a domingo), variando
las plataformas según corresponda. Para cada post generá: un día de la semana (con fecha
aproximada tipo "Lunes"), la plataforma, el tipo de contenido (carousel, reel, video, imagen o
story), una hora sugerida de publicación, un hook (primera línea/gancho llamativo), el copy
completo del post, una llamada a la acción (CTA), 5 a 10 hashtags relevantes, y el objetivo
específico del post (awareness, engagement, conversion o retencion, coherente con el eje de
esta semana).

Respondé en español rioplatense, en formato JSON array (sin texto adicional, sin markdown),
con esta estructura exacta:
[
  {
    "dia": "Lunes",
    "plataforma": "Instagram",
    "tipo_contenido": "carousel",
    "hora_sugerida": "10:00 AM",
    "hook": "...",
    "copy": "...",
    "cta": "...",
    "hashtags": ["#ejemplo1", "#ejemplo2"],
    "objetivo_post": "awareness"
  }
]
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
    const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const cleanText = rawText.replace(/```json|```/g, '').trim();
    const posts = JSON.parse(cleanText);

    // 6. Guardar los posts de esta semana. La "fecha" real no se calcula acá
    // (no tenemos el día calendario exacto de "Lunes" sin fecha_inicio parseada
    // con certeza); se guarda el texto del día dentro del copy si hace falta,
    // y el campo fecha queda null — el frontend puede mostrarlo por día de texto.
    const { data: inserted, error: insertError } = await supabase
      .from('t_campana_posts')
      .insert(
        posts.map((p: any) => ({
          campana_id,
          semana,
          fecha: null,
          plataforma: p.plataforma,
          tipo_contenido: p.tipo_contenido,
          hora_sugerida: p.hora_sugerida,
          hook: p.hook,
          copy: p.dia ? `[${p.dia}] ${p.copy}` : p.copy,
          cta: p.cta,
          hashtags: p.hashtags || [],
          objetivo_post: p.objetivo_post,
          estado: 'pendiente',
        })),
      )
      .select();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ ok: true, posts: inserted }), {
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
