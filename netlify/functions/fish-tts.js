// Fish Audio text-to-speech proxy. The API key remains server-side.
exports.handler = async (event) => {
  const key = process.env.FISH_AUDIO_API_KEY;
  const json = (statusCode, body) => ({
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  });
  if (event.httpMethod === 'GET') {
    return json(200, { configured: !!key, provider: 'fish-audio' });
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  if (!key) return json(503, { error: 'FISH_AUDIO_NOT_CONFIGURED' });
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'BAD_JSON' }); }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 4000) return json(400, { error: 'TEXT_REQUIRED_OR_TOO_LONG' });
  try {
    const upstream = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'model': 's2.1-pro',
      },
      body: JSON.stringify({
        text,
        reference_id: '662ee6a122844f7e8023fa63f6a512d2',
        format: 'mp3',
      }),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return json(upstream.status === 401 ? 502 : upstream.status, { error: 'FISH_AUDIO_UPSTREAM', status: upstream.status, detail: detail.slice(0, 500) });
    }
    return {
      statusCode: 200,
      headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' },
      body: Buffer.from(await upstream.arrayBuffer()).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('Fish Audio TTS failed:', error);
    return json(502, { error: 'FISH_AUDIO_NETWORK_ERROR' });
  }
};
