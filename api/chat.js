// Función de servidor de Vercel. La clave vive en Settings > Environment Variables (GEMINI_API_KEY).
const SYSTEM = `Eres el asistente virtual de Almonacid Law Firm, estudio jurídico de Huancayo (Perú) liderado por la abogada Solanch Joselyn Chipana Almonacid. Hablas en español, con voz directa, empática y honesta, en frases cortas y sin jerga jurídica.
Áreas del estudio: propiedades (saneamiento de predios, prescripción adquisitiva, propiedad y posesión, desalojos, división y partición), herencias (sucesión intestada, petición de herencia, derechos hereditarios, división de bienes, conflictos entre herederos), contratos (compraventa, donaciones, transferencias, revisión, nulidad, incumplimiento) y conflictos (defensa judicial, negociación, conciliación extrajudicial).
Filosofía: el Poder Judicial es un medio, no el único camino; se litiga cuando conviene y se negocia o concilia cuando protege mejor al cliente. No se prometen resultados.
Cómo actúas: 1) entiende el caso con UNA pregunta a la vez (tipo de situación, quiénes intervienen, qué documentos tiene, urgencia); 2) explica en 2 a 4 frases el camino general; 3) cuando ya tengas contexto suficiente, sugiere agendar una consulta con la abogada por WhatsApp (+51 910 254 757).
Reglas estrictas: NO eres abogado ni das asesoría legal ni dictámenes. NO prometas ni estimes probabilidades de ganar, plazos exactos ni costos. NO inventes leyes, artículos ni plazos; si no estás seguro, di que la abogada debe evaluarlo. Pide no compartir datos sensibles, números de documentos ni archivos en el chat. Si el tema está fuera de las áreas del estudio (por ejemplo penal o laboral) o hay urgencia o riesgo personal, deriva a la abogada. Respuestas de máximo 90 palabras. Recuerda cuando corresponda que esto es orientación general y no reemplaza una consulta.`;

// Pon DEBUG en false cuando el asistente ya funcione, para ocultar los detalles técnicos.
const DEBUG = true;
const MODEL = 'gemini-2.5-flash';
const hits = new Map(); // límite simple por IP (se reinicia al reciclarse la función)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const ip = (req.headers['x-forwarded-for'] || 'x').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (recent.length >= 30) return res.status(429).json({ reply: 'Llegaste al límite de mensajes por ahora. Para seguir, escríbenos por WhatsApp al +51 910 254 757.' });
  hits.set(ip, [...recent, now]);

  const msgs = (req.body && req.body.messages) || [];
  if (!Array.isArray(msgs) || !msgs.length || msgs.length > 14) return res.status(400).json({ error: 'Solicitud inválida' });
  const contents = msgs.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '').slice(0, 800) }]
  }));

  let detail = '';
  try {
    if (!process.env.GEMINI_API_KEY) { detail = 'falta la variable GEMINI_API_KEY en Vercel (o falta Redeploy)'; throw new Error(detail); }
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        generationConfig: { temperature: 0.5, maxOutputTokens: 400 }
      })
    });
    const d = await r.json();
    if (!r.ok) { detail = 'Gemini respondió ' + r.status + ': ' + String(d?.error?.message || JSON.stringify(d)).slice(0, 220); throw new Error(detail); }
    const reply = d?.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim();
    if (!reply) { detail = 'respuesta vacía: ' + JSON.stringify(d).slice(0, 220); throw new Error(detail); }
    res.status(200).json({ reply });
  } catch (e) {
    detail = detail || (e && e.message) || 'error desconocido';
    console.error('DIAGNOSTICO', detail);
    res.status(200).json({ reply: 'No pude responder en este momento. Escríbenos por WhatsApp al +51 910 254 757 y la abogada te atenderá.' + (DEBUG ? '\n\n[Diagnóstico: ' + detail + ']' : '') });
  }
}
