import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const COSTO_GENERAR_PROMOS = 600;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  // El navegador siempre manda un preflight OPTIONS antes del POST real
  // cuando hay headers custom (Authorization). Sin esto, el preflight
  // caía en el chequeo de método y devolvía 405 -> el browser lo reporta como CORS error.
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

    // 1. Verificar y descontar saldo de forma atómica (lanza excepción si es insuficiente)
    const { error: saldoError } = await supabase.rpc('descontar_saldo_marketing', {
      p_monto: COSTO_GENERAR_PROMOS,
      p_tipo: 'generar_promos',
      p_descripcion: 'Generación de 4 propuestas de promoción',
      p_usuario_id: usuario_id ?? null,
    });

    if (saldoError) {
      return new Response(JSON.stringify({ error: saldoError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Contexto real del negocio: productos más vendidos y con stock bajo
    const [{ data: topProductos }, { data: stockBajo }, { data: configPromo }] = await Promise.all([
      supabase
        .from('t_trabajo_productos')
        .select('producto_id, t_productos(nombre), cantidad')
        .order('cantidad', { ascending: false })
        .limit(5),
      supabase
        .from('t_productos')
        .select('nombre, stock')
        .eq('activo', true)
        .lt('stock', 5)
        .order('stock', { ascending: true })
        .limit(5),
      supabase.from('t_config_promo').select('instruccion_extra').eq('id', 1).maybeSingle(),
    ]);

    const nombresTopProductos = (topProductos || [])
      .map((p: any) => p.t_productos?.nombre)
      .filter(Boolean)
      .join(', ') || 'sin datos suficientes todavía';

    const nombresStockBajo = (stockBajo || [])
      .map((p: any) => p.nombre)
      .filter(Boolean)
      .join(', ') || 'ninguno';

    const instruccionExtra = configPromo?.instruccion_extra || 'ninguna';

    // 3. Llamar a Gemini
    const prompt = `
Sos un experto en marketing para una imprenta llamada Grafiko.
Productos más vendidos: ${nombresTopProductos}
Productos con stock bajo (oportunidad de promoción): ${nombresStockBajo}
Instrucciones extra del dueño del negocio: ${instruccionExtra}

Generá 4 propuestas de promoción para redes sociales, en español rioplatense, en formato JSON array (sin texto adicional, solo el array):
[{ "titulo": "", "descripcion": "", "hashtags": ["#ejemplo"], "llamada_accion": "" }]
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
    const propuestas = JSON.parse(cleanText);

    // 4. Guardar las propuestas generadas
    const { data: inserted, error: insertError } = await supabase
      .from('t_promociones')
      .insert(
        propuestas.map((p: any) => ({
          titulo: p.titulo,
          descripcion: p.descripcion,
          hashtags: p.hashtags || [],
          llamada_accion: p.llamada_accion,
          estado: 'pendiente',
        })),
      )
      .select();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ ok: true, promociones: inserted }), {
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
