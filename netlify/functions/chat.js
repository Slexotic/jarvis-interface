// J.A.R.V.I.S. language core proxy (Netlify Function)
// Keeps your Anthropic API key on the server so it never reaches the browser.
//
// Environment variables (Netlify > Project configuration > Environment variables):
//   ANTHROPIC_API_KEY  (required)  your Anthropic API key
//   JARVIS_PASSCODE    (optional)  if set, the browser must send this passcode
//   JARVIS_MODEL       (optional)  defaults to claude-sonnet-5-5

const DEFAULT_MODEL = process.env.JARVIS_MODEL || 'claude-sonnet-5-5';

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  const key = process.env.ANTHROPIC_API_KEY;
  const passcode = process.env.JARVIS_PASSCODE;

  // Health check used by the interface to decide between cloud and local mode
  if (event.httpMethod === 'GET') {
    return json(200, { ok: true, configured: !!key, passcodeRequired: !!passcode });
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

  const useModel = typeof model === 'string' && /^claude-[a-z0-9.-]+$/.test(model) ? model : DEFAULT_MODEL;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: useModel,
        max_tokens: 700,
        system: String(system || '').slice(0, 8000),
        messages,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json(502, { error: 'UPSTREAM', status: res.status, detail: data && data.error && data.error.message });
    }
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return json(200, { text });
  } catch (err) {
    return json(502, { error: 'NETWORK', detail: String(err && err.message) });
  }
};
