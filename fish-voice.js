// Replace browser-only speech output with the user's saved Fish Audio voice.
let fishPlayback = null;
window.speak = async function (text) {
  if (muted) return;
  if (fishPlayback) { fishPlayback.pause(); fishPlayback = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  try {
    const response = await fetch('/.netlify/functions/fish-tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: String(text).slice(0, 4000) }),
    });
    if (!response.ok) throw new Error('Fish Audio HTTP ' + response.status);
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    fishPlayback = new Audio(audioUrl);
    speaking = true;
    setState('speaking');
    await new Promise((resolve, reject) => {
      fishPlayback.onended = resolve;
      fishPlayback.onerror = reject;
      fishPlayback.play().catch(reject);
    });
    URL.revokeObjectURL(audioUrl);
    fishPlayback = null;
    speaking = false;
    setState('idle');
  } catch (error) {
    console.warn('Fish Audio playback unavailable; using browser voice fallback.', error);
    if (fishPlayback) { fishPlayback.pause(); fishPlayback = null; }
    speaking = false;
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(String(text));
      const available = speechSynthesis.getVoices();
      const voice = available.find((v) => /Daniel|UK English Male|Arthur/i.test(v.name)) || available.find((v) => v.lang === 'en-GB');
      if (voice) utterance.voice = voice;
      utterance.rate = 1.03;
      utterance.pitch = 0.9;
      utterance.onend = () => setState('idle');
      utterance.onerror = () => setState('idle');
      speechSynthesis.speak(utterance);
    } else setState('idle');
  }
};
