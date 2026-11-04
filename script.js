// J.A.R.V.I.S. v1.0 - Gemini-powered, voice-first
const $ = (id) => document.getElementById(id);
const chatLog = $('chat-log'), userInput = $('user-input'), chatStatus = $('chat-status');
const visualPreview = $('visual-preview'), lastAnalysis = $('last-analysis'), timeDisplay = $('time-display');
const imageInput = $('image-input'), voiceBtn = $('voice-btn'), wakeBtn = $('wake-btn'), muteBtn = $('mute-btn'), orb = $('orb');
const API = '/.netlify/functions/chat';
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
let cloud = false, busy = false, speaking = false, wake = false, ptt = false, rec = null, awakeUntil = 0;
let history = store.get('jarvis-history', []), muted = store.get('jarvis-muted', false);
const STATES = { idle: 'AWAITING INPUT', listening: 'LISTENING', thinking: 'PROCESSING', speaking: 'SPEAKING' };
const SITES = { youtube: 'https://www.youtube.com', google: 'https://www.google.com', github: 'https://github.com', netlify: 'https://app.netlify.com', gmail: 'https://mail.google.com', maps: 'https://maps.google.com' };

function setState(s) {
  orb.dataset.state = s;
  chatStatus.textContent = STATES[s] + (wake && s === 'idle' ? ' - SAY JARVIS' : '');
}
function systemPrompt() {
  return `You are J.A.R.V.I.S., the user's personal AI assistant: calm, precise, dry British wit. Address the user as Sir, sparingly. Your replies are spoken aloud, so keep them to one to three short sentences unless asked for detail, with no markdown, lists or emojis. Be accurate and say so when unsure. Current date and time: ${new Date().toString()}.`;
}
function updateClock() { timeDisplay.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false }); }
setInterval(updateClock, 1000); updateClock();

function addMessage(text, type = 'jarvis') {
  const div = document.createElement('div');
  div.className = `message ${type}`;
  if (type === 'jarvis') {
    const s = document.createElement('div');
    s.className = 'sender'; s.textContent = 'J.A.R.V.I.S.';
    div.append(s, document.createTextNode(text));
  } else div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function pickVoice() {
  const v = speechSynthesis.getVoices();
  return v.find((x) => /Daniel|UK English Male|Arthur/i.test(x.name)) || v.find((x) => x.lang === 'en-GB') || v.find((x) => x.lang.startsWith('en')) || null;
}
function speak(text) {
  return new Promise((resolve) => {
    if (muted || !('speechSynthesis' in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.split('*').join('').split('#').join('').split('`').join(''));
    const v = pickVoice(); if (v) u.voice = v;
    u.rate = 1.03; u.pitch = 0.9;
    u.onstart = () => { speaking = true; setState('speaking'); };
    const done = () => { speaking = false; setState('idle'); resolve(); };
    u.onend = done; u.onerror = done;
    speechSynthesis.speak(u);
  });
}
async function reply(text) {
  addMessage(text, 'jarvis');
  await speak(text);
  awakeUntil = Date.now() + 10000;
}

function clearAll() {
  history = []; store.set('jarvis-history', history);
  chatLog.innerHTML = '';
  addMessage('Memory and logs cleared.', 'system');
  $('mem-val').textContent = '0 ENTRIES';
}
function localTool(t) {
  const l = t.toLowerCase();
  if (l.includes('what time') || l.includes('time is it')) return `It is ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}, Sir.`;
  if (l.includes('what day') || l.includes('the date')) return new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + ', Sir.';
  if (l.startsWith('open ')) {
    const n = l.slice(5).trim();
    window.open(SITES[n] || 'https://www.google.com/search?q=' + encodeURIComponent(n), '_blank');
    return `Opening ${n}, Sir.`;
  }
  const m = l.match(/timer (for )?([0-9]+) (second|minute|hour)/);
  if (m) {
    const ms = Number(m[2]) * { second: 1000, minute: 60000, hour: 3600000 }[m[3]];
    setTimeout(() => reply('Your timer is complete, Sir.'), ms);
    return `Timer set for ${m[2]} ${m[3]}${m[2] === '1' ? '' : 's'}, Sir.`;
  }
  if (l.includes('clear') && (l.includes('memory') || l.includes('history') || l.includes('logs'))) { clearAll(); return 'Memory cleared, Sir.'; }
  return null;
}

async function callApi(messages, retry = true) {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', 'x-jarvis-passcode': store.get('jarvis-pass', '') }, body: JSON.stringify({ system: systemPrompt(), messages }) });
  if (r.status === 401 && retry) {
    const p = prompt('Passcode, Sir?');
    if (!p) throw new Error('BAD_PASSCODE');
    store.set('jarvis-pass', p);
    return callApi(messages, false);
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('JARVIS API', d); throw new Error(d.error || 'HTTP_' + r.status); }
  return d.text || 'I have nothing to report, Sir.';
}
function friendlyError(e) {
  const m = String(e.message);
  if (m === 'BAD_PASSCODE') return 'Passcode rejected, Sir.';
  if (m === 'UPSTREAM') return 'The language core returned an error, Sir. Please check the API key and model name.';
  return 'I could not reach the language core, Sir.';
}

async function ask(text, img) {
  if (busy) return;
  busy = true; setState('thinking');
  let out;
  try {
    out = img ? null : localTool(text);
    if (!out && !cloud) out = 'My language core is offline, Sir. Add the GEMINI_API_KEY in Netlify and redeploy to bring me fully online.';
    if (!out) {
      const content = img ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } }, { type: 'text', text }] : text;
      const msgs = [...history.slice(-20), { role: 'user', content }];
      while (msgs.length > 1 && msgs[0].role !== 'user') msgs.shift();
      out = await callApi(msgs);
      history.push({ role: 'user', content: img ? text + ' [image shared]' : text }, { role: 'assistant', content: out });
      history = history.slice(-40); store.set('jarvis-history', history);
      $('mem-val').textContent = history.length + ' ENTRIES';
    }
  } catch (e) { out = friendlyError(e); }
  if (img) lastAnalysis.textContent = out;
  busy = false;
  await reply(out);
}
function sendMessage(arg) {
  const text = (typeof arg === 'string' ? arg : userInput.value).trim();
  if (!text || busy) return;
  if (speaking) speechSynthesis.cancel();
  addMessage(text, 'user'); userInput.value = '';
  ask(text);
}
function jarvisCommand(cmd) {
  if (cmd === 'clear') return clearAll();
  if (cmd === 'status') {
    addMessage('System status requested.', 'user');
    reply(`Language core ${cloud ? 'online' : 'offline'}. Memory holds ${history.length} entries. Voice replies ${muted ? 'muted' : 'enabled'}. Wake word ${wake ? 'armed' : 'off'}.`);
  }
}

function shrink(file) {
  return new Promise((res) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      const d = c.toDataURL('image/jpeg', 0.82);
      res({ url: d, b64: d.split(',')[1] });
    };
    img.src = u;
  });
}
imageInput.addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const { url, b64 } = await shrink(f);
  visualPreview.innerHTML = '';
  const im = document.createElement('img'); im.src = url; im.alt = 'Visual input';
  visualPreview.appendChild(im);
  lastAnalysis.textContent = 'Analyzing...';
  const q = userInput.value.trim() || 'Describe what you see in this image, briefly.';
  userInput.value = '';
  addMessage(q, 'user');
  await ask(q, b64);
  imageInput.value = '';
});

function syncButtons() {
  wakeBtn.textContent = 'Wake Word: ' + (wake ? 'ON' : 'OFF'); wakeBtn.classList.toggle('on', wake);
  muteBtn.textContent = 'Voice Reply: ' + (muted ? 'OFF' : 'ON'); muteBtn.classList.toggle('on', !muted);
  voiceBtn.textContent = ptt ? 'Listening...' : 'Voice Input';
  $('voice-val').textContent = wake ? 'WAKE ARMED' : muted ? 'MUTED' : 'STANDBY';
}
function handleVoice(raw) {
  const t = raw.trim();
  if (!t) return;
  if (ptt) return sendMessage(t);
  const i = t.toLowerCase().indexOf('jarvis');
  if (i >= 0) {
    const rest = t.slice(i + 6).replace(/^[,.!? ]+/, '');
    if (!rest) { addMessage('Jarvis?', 'user'); reply('Yes, Sir?'); } else sendMessage(rest);
  } else if (Date.now() < awakeUntil) sendMessage(t);
}
function startRec(continuous) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { addMessage('Voice recognition is not supported in this browser, Sir. Chrome or Edge recommended.', 'system'); return false; }
  rec = new SR(); rec.lang = 'en-US'; rec.continuous = continuous; rec.interimResults = false;
  rec.onstart = () => { if (!speaking && !busy) setState('listening'); };
  rec.onresult = (e) => { if (speaking || busy) return; handleVoice(e.results[e.resultIndex][0].transcript); };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wake = false; ptt = false; syncButtons(); addMessage('Microphone access was denied, Sir.', 'system'); }
  };
  rec.onend = () => {
    rec = null;
    if (wake) setTimeout(() => { if (wake && !rec) startRec(true); }, 300);
    else { ptt = false; syncButtons(); setState('idle'); }
  };
  try { rec.start(); } catch (e) { rec = null; return false; }
  return true;
}
function toggleVoice() {
  if (rec) { rec.stop(); return; }
  ptt = true;
  if (!startRec(false)) ptt = false;
  syncButtons();
}
function toggleWake() {
  wake = !wake;
  if (wake) { if (rec) rec.stop(); else if (!startRec(true)) wake = false; }
  else if (rec) rec.stop();
  syncButtons(); setState('idle');
}
function toggleMute() {
  muted = !muted; store.set('jarvis-muted', muted);
  if (muted && 'speechSynthesis' in window) speechSynthesis.cancel();
  syncButtons();
}

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

window.addEventListener('load', async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  try { const r = await fetch(API); const d = await r.json(); cloud = !!d.configured; } catch (e) { cloud = false; }
  $('core-val').textContent = cloud ? 'GEMINI ONLINE' : 'OFFLINE MODE';
  $('core-val').className = 'value ' + (cloud ? 'green' : 'cyan');
  $('mem-val').textContent = history.length + ' ENTRIES';
  addMessage('Mainframe initialized.', 'system');
  history.slice(-6).forEach((m) => { if (typeof m.content === 'string') addMessage(m.content, m.role === 'user' ? 'user' : 'jarvis'); });
  const h = new Date().getHours(), g = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  addMessage(cloud ? `Good ${g}, Sir. Language core online. Type, tap Voice Input, or arm the wake word and say Jarvis.` : `Good ${g}, Sir. I am running in offline mode until an API key is added to the server.`, 'jarvis');
  syncButtons(); setState('idle');
});
