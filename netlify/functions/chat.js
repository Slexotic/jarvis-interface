// J.A.R.V.I.S. language core proxy (Netlify Function)
// Keeps the Gemini API key on the server so it never reaches the browser.
//
// Environment variables:
//   GEMINI_API_KEY  (required)  Gemini API key stored in Netlify
//   JARVIS_PASSCODE (optional)  if set, the browser must send this passcode
//   JARVIS_MODEL    (optional)  defaults to gemini-3.8-flash

const DEFAULT_MODEL = process.env.JARVIS_MODEL || 'gemini-3.8-flash';

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(obj),
});

function toGeminiContents(messages) {
  return messages.map((message) => {
    const parts = Array.isArray(message.content)
      ? message.content.map((part) => {
          if (part.type === 'image' && part.source && part.source.type === 'base64') {
            return {
              inlineData: {
                mimeType: part.source.media_type || 'image/jpeg',
                data: part.source.data,
              },
            };
          }
          if (part.type === 'text') return { text: String(part.text || '') };
          return null;
        }).filter(Boolean)
      : [{ text: String(message.content || '') }];

    return {
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: parts.length ? parts : [{ text: ' ' }],
    };
  });
}

exports.handler = async (event) => {
  const key = process.env.GEMINI_API_KEY;
  const passcode = process.env.JARVIS_PASSCODE;

  if (event.httpMethod === 'GET') {
    return json(200, { ok: true, configured: !!key, provider: 'gemini', passcodeRequired: !!passcode });
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  if (!key) return json(503, { error: 'NO_KEY' });

  if (passcode && (event.headers['x-jarvis-passcode'] || '') !== passcode) {
    return json(401, { error: 'BAD_PASSCODE' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'BAD_JSON' });
  }

  const { system, messages, model } = body;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    return json(400, { error: 'BAD_MESSAGES' });
  }
  if (!messages.every((m) => m && (m.role === 'user' || m.role === 'assistant'))) {
    return json(400, { error: 'BAD_ROLE' });
  }

  const useModel = typeof model === 'string' && /^gemini-[a-z0-9.-]+$/.test(model) ? model : DEFAULT_MODEL;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: String(system || '').slice(0, 8000) }] },
        contents: toGeminiContents(messages),
        generationConfig: { maxOutputTokens: 700 },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data && data.error && data.error.message;
      return json(502, { error: 'UPSTREAM', status: res.status, detail });
    }
    const text = (data.candidates?.[0]?.content?.parts || [])
      .filter((part) => typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n');
    if (!text) return json(502, { error: 'EMPTY_RESPONSE', detail: 'Gemini returned no text.' });
    return json(200, { text });
  } catch (err) {
    return json(502, { error: 'NETWORK', detail: String(err && err.message) });
  }
};
