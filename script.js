// J.A.R.V.I.S. Web Interface – Starter Build 0.1

const chatLog = document.getElementById('chat-log');
const userInput = document.getElementById('user-input');
const chatStatus = document.getElementById('chat-status');
const visualPreview = document.getElementById('visual-preview');
const lastAnalysis = document.getElementById('last-analysis');
const timeDisplay = document.getElementById('time-display');
const imageInput = document.getElementById('image-input');
const voiceBtn = document.getElementById('voice-btn');

let isListening = false;
let recognition = null;

function updateClock() {
  const now = new Date();
  timeDisplay.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

function addMessage(text, type = 'jarvis') {
  const div = document.createElement('div');
  div.className = `message ${type}`;
  if (type === 'jarvis') {
    div.innerHTML = `<div class="sender">J.A.R.V.I.S.</div>${text}`;
  } else if (type === 'user') {
    div.textContent = text;
  } else {
    div.textContent = text;
  }
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setStatus(text) {
  chatStatus.textContent = text;
}

function generateJarvisResponse(userText, hasImage = false) {
  const lower = userText.toLowerCase();
  if (lower.includes('are you up') || lower.includes('are you there') || lower.includes('online')) {
    return "At your service, Sir.";
  }
  if (lower.includes('status') || lower.includes('systems')) {
    return "All systems nominal. Core online. Vision module ready. Awaiting your next directive, Boss.";
  }
  if (lower.includes('hello') || lower.includes('hi jarvis') || lower.includes('hey')) {
    return "Good evening, Sir. How may I assist you?";
  }
  if (lower.includes('clear') || lower.includes('wipe')) {
    return "Logs cleared. Interface refreshed.";
  }
  if (hasImage || lower.includes('look at') || lower.includes('what am i holding') || lower.includes('describe')) {
    return "Visual feed received. Analyzing… Object identification complete. I am ready to report details once you provide more context or a clearer frame, Sir.";
  }
  if (lower.includes('thank')) {
    return "Always a pleasure, Sir.";
  }
  if (lower.includes('who are you')) {
    return "I am J.A.R.V.I.S. — Just A Rather Very Intelligent System. Your personal mainframe interface.";
  }
  return "Understood, Sir. Processing your request. For full intelligence, connect a language model API in the script. In the meantime, I remain at your command.";
}

function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  userInput.value = '';
  setStatus('PROCESSING…');
  setTimeout(() => {
    const response = generateJarvisResponse(text);
    addMessage(response, 'jarvis');
    setStatus('AWAITING INPUT');
  }, 600 + Math.random() * 400);
}

function jarvisCommand(cmd) {
  if (cmd === 'status') {
    addMessage('System status requested.', 'user');
    setTimeout(() => {
      addMessage("All primary systems online and nominal, Sir. Memory stable. Vision ready. Voice module on standby.", 'jarvis');
    }, 400);
  }
  if (cmd === 'clear') {
    chatLog.innerHTML = '';
    addMessage('Interface logs cleared.', 'system');
  }
}

imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    visualPreview.innerHTML = `<img src="${ev.target.result}" alt="Visual input">`;
    lastAnalysis.textContent = 'Image loaded. Ready for analysis command.';
    addMessage('Visual input received.', 'system');
    setTimeout(() => {
      addMessage("Visual feed acquired, Sir. I am analyzing the frame now. You may ask me what you are holding or request a full description.", 'jarvis');
    }, 500);
  };
  reader.readAsDataURL(file);
});

function toggleVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    addMessage('Voice recognition is not supported in this browser, Sir.', 'system');
    return;
  }
  if (isListening) {
    recognition.stop();
    isListening = false;
    voiceBtn.textContent = 'Voice Input';
    setStatus('AWAITING INPUT');
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    isListening = true;
    voiceBtn.textContent = 'Listening…';
    setStatus('LISTENING');
  };
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    userInput.value = transcript;
    sendMessage();
  };
  recognition.onerror = () => {
    isListening = false;
    voiceBtn.textContent = 'Voice Input';
    setStatus('AWAITING INPUT');
  };
  recognition.onend = () => {
    isListening = false;
    voiceBtn.textContent = 'Voice Input';
    setStatus('AWAITING INPUT');
  };
  recognition.start();
}

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

window.addEventListener('load', () => {
  addMessage('Mainframe initialized.', 'system');
  setTimeout(() => {
    addMessage('Good evening, Sir. All systems are online and at your disposal. How may I be of service?', 'jarvis');
  }, 700);
});
