import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Se generan 3 alternativas; cada una cuesta lo mismo que una imagen suelta del resto del sistema.
const COSTO_POR_IMAGEN = 1250;
const CANTIDAD_ALTERNATIVAS = 3;
const COSTO_TOTAL = COSTO_POR_IMAGEN * CANTIDAD_ALTERNATIVAS;

const LOGO_UBICACION_TEXTO: Record<string, string> = {
  superior_izquierda: 'esquina superior izquierda',
  superior_derecha: 'esquina superior derecha',
  inferior_izquierda: 'esquina inferior izquierda',
  inferior_derecha: 'esquina inferior derecha',
  centro: 'centrado, como elemento principal',
  sin_logo: '',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function generarUnaImagen(prompt: string): Promise<{ mimeType: string; data: string } | null> {
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );

  if (!geminiRes.ok) {
    console.error('Error de Gemini:', await geminiRes.text());
    return null;
  }

  const geminiData = await geminiRes.json();
  const parts = geminiData.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p: any) => p.inlineData?.data);
  if (!imagePart) return null;

  return { mimeType: imagePart.inlineData.mimeType, data: imagePart.inlineData.data };
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
    const body = await req.json().catch(() => ({}));
    const {
      cliente_id,
      ancho_px,
      alto_px,
      logo_ubicacion,
      informacion,
      textos_obligatorios,
      usuario_id,
    } = body || {};

    if (!cliente_id) {
      return new Response(JSON.stringify({ error: 'Falta cliente_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const ancho = Number(ancho_px);
    const alto = Number(alto_px);
    if (!ancho || ancho <= 0 || !alto || alto <= 0) {
      return new Response(JSON.stringify({ error: 'Las medidas de la imagen son inválidas' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const ubicacion = String(logo_ubicacion || '');
    if (!(ubicacion in LOGO_UBICACION_TEXTO)) {
      return new Response(JSON.stringify({ error: 'Ubicación de logo inválida' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const info = String(informacion || '').trim();
    if (!info) {
      return new Response(JSON.stringify({ error: 'Falta la información/contexto de la imagen' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const textos: string[] = Array.isArray(textos_obligatorios)
      ? textos_obligatorios.map((t: any) => String(t || '').trim()).filter((t: string) => t.length > 0)
      : [];

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Traer el cliente y su análisis de identidad visual
    const { data: cliente, error: clienteError } = await supabase
      .from('t_clientes')
      .select('id, razon_social, nombre')
      .eq('id', cliente_id)
      .single();

    if (clienteError || !cliente) {
      return new Response(JSON.stringify({ error: 'El cliente no existe' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const nombreCliente = cliente.razon_social || cliente.nombre || 'la marca';

    const { data: identidad } = await supabase
      .from('t_analisis_identidad_cliente')
      .select('estilo_descripcion')
      .eq('cliente_id', cliente_id)
      .maybeSingle();

    // 2. Descontar saldo de forma atómica (wallet compartido de Grafiko) ANTES de llamar a Gemini,
    // mismo criterio que el resto del sistema (sin reembolso si alguna alternativa falla).
    const { error: saldoError } = await supabase.rpc('descontar_saldo_marketing', {
      p_monto: COSTO_TOTAL,
      p_tipo: 'generar_imagen_aislada',
      p_descripcion: `3 alternativas de imagen suelta para ${nombreCliente}`,
      p_usuario_id: usuario_id ?? null,
    });

    if (saldoError) {
      return new Response(JSON.stringify({ error: saldoError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Armar el prompt: identidad de marca como bloque de reglas obligatorias al principio
    // (mismo patrón validado en el resto del sistema), más las especificaciones del formulario.
    const bloqueIdentidad = identidad?.estilo_descripcion
      ? `
REGLAS DE IDENTIDAD VISUAL DE LA MARCA "${nombreCliente}" (obligatorias, son la prioridad #1 del diseño):
${identidad.estilo_descripcion}

Estas reglas de paleta de colores, tipografía y estilo gráfico DEBEN aplicarse literalmente a la
imagen, sin importar el tema. El tema es el contenido; el estilo de "${nombreCliente}" descripto
arriba es el envoltorio visual obligatorio.
      `.trim()
      : `No hay identidad visual analizada todavía para "${nombreCliente}": usá un estilo profesional, limpio y moderno.`;

    const logoTexto = ubicacion === 'sin_logo'
      ? 'No incluyas ningún logo ni isotipo de marca en esta imagen.'
      : `Ubicación obligatoria del logo de la marca: ${LOGO_UBICACION_TEXTO[ubicacion]}.`;

    const textosTexto = textos.length > 0
      ? `Textos que DEBEN aparecer en la imagen, EXACTAMENTE como están escritos a continuación (no los traduzcas, resumas ni cambies):\n${textos.map((t) => `- "${t}"`).join('\n')}`
      : 'No hay textos obligatorios para esta imagen: priorizá un diseño limpio, sin texto innecesario.';

    const prompt = `
${bloqueIdentidad}

Generá una imagen publicitaria con estas especificaciones técnicas y de contenido:

- Dimensiones: ${ancho}x${alto} píxeles (respetá esa proporción y orientación exactas).
- ${logoTexto}
- Información / contexto de la imagen: ${info}
- ${textosTexto}

La imagen debe tener una composición profesional de diseño gráfico publicitario (no un boceto
simple), con los textos obligatorios integrados de forma legible y bien distribuida en el diseño,
respetando la ubicación del logo indicada.

REGLAS DE IDIOMA (obligatorias, muy importantes): todo el texto de la imagen debe estar en español
rioplatense/argentino, usando exclusivamente el alfabeto español (incluida la letra "ñ" cuando
corresponda). NO uses letras ni diacríticos de otros idiomas (nada de tildes tipo portugués "õ"/"ã",
diéresis alemanas, ni caracteres de otros alfabetos). Reproducí el nombre de la marca exactamente
como fue escrito arriba, letra por letra, sin agregar ni quitar acentos.
    `.trim();

    // 4. Generar las alternativas (llamadas secuenciales independientes; se tolera que alguna falle).
    const subidas: string[] = [];
    for (let i = 0; i < CANTIDAD_ALTERNATIVAS; i++) {
      const imagen = await generarUnaImagen(prompt);
      if (!imagen) continue;

      const extension = imagen.mimeType.split('/')[1] || 'jpeg';
      const fileName = `aisladas/${cliente_id}-${Date.now()}-${i}.${extension}`;
      const binaryData = Uint8Array.from(atob(imagen.data), (c) => c.charCodeAt(0));

      const { error: uploadError } = await supabase.storage
        .from('marketing')
        .upload(fileName, binaryData, { contentType: imagen.mimeType, upsert: true });

      if (uploadError) {
        console.error('Error subiendo alternativa', i, uploadError);
        continue;
      }

      const { data: publicUrlData } = supabase.storage.from('marketing').getPublicUrl(fileName);
      subidas.push(publicUrlData.publicUrl);
    }

    if (subidas.length === 0) {
      throw new Error('No se pudo generar ninguna alternativa de imagen. Los créditos ya se descontaron, revisá el saldo si corresponde reclamarlo.');
    }

    // 5. Guardar el registro con las alternativas obtenidas
    const { data: registro, error: insertError } = await supabase
      .from('t_imagenes_aisladas_cliente')
      .insert({
        cliente_id,
        ancho_px: ancho,
        alto_px: alto,
        logo_ubicacion: ubicacion,
        informacion: info,
        textos_obligatorios: textos,
        imagenes_url: subidas,
        usuario_id: usuario_id ?? null,
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        ok: true,
        id: registro.id,
        imagenes_url: subidas,
        generadas: subidas.length,
        solicitadas: CANTIDAD_ALTERNATIVAS,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
