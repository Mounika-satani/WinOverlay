// src/renderer/renderer.js
const { ipcRenderer } = require("electron");

// No-op function to replace debug logging
function debugLog() {}

// DOM Elements
const captionEl = document.getElementById("caption");
const aiEl = document.getElementById("aiResponse");
const statusEl = document.getElementById("status");
const configPanel = document.getElementById("configPanel");
const gearBtn = document.getElementById("gearBtn");
const stopBtn = document.getElementById("stopBtn");
const startBtn = document.getElementById("startBtn");
const conversationHistoryEl = document.getElementById("conversationHistory");
const askInput = document.getElementById("askInput");
const askBtn = document.getElementById("askBtn");
const codeAnswer = document.getElementById('codeAnswer');

// State
let currentQuestion = '';
let currentAnswer = '';
let isProcessing = false;
let isStarted = false;
let lastAskedIsCode = false;

// Adjust bottom padding to avoid overlap with fixed input panel
function adjustScrollPadding() {
  const scrollContainer = document.querySelector('.scroll-container');
  const inputPanel = document.querySelector('.input-panel');
  const tabs = document.querySelector('.tabs');
  const codeAnswerEl = document.getElementById('codeAnswer');
  if (!scrollContainer || !inputPanel) return;

  // Compute dynamic heights
  const inputH = inputPanel.offsetHeight || 0;
  const tabsH = tabs ? tabs.offsetHeight : 48;

  // Set CSS variables so CSS can layout correctly
  scrollContainer.style.setProperty('--input-panel-h', inputH + 'px');
  scrollContainer.style.setProperty('--tabs-h', tabsH + 'px');

  // Also cap the code answer area so it ends above the input panel
  if (codeAnswerEl) {
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    const available = Math.max(150, viewportH - inputH - tabsH - 20);
    codeAnswerEl.style.maxHeight = available + 'px';
    codeAnswerEl.style.overflowY = 'auto';
    codeAnswerEl.style.overflowX = 'hidden';
  }
}

window.addEventListener('DOMContentLoaded', adjustScrollPadding);
window.addEventListener('resize', adjustScrollPadding);

// Status chip helpers
function updateConnChip(connected) {
  const chip = document.getElementById('connChip');
  if (!chip) return;
  chip.textContent = connected ? 'Connected' : 'Disconnected';
  chip.classList.toggle('on', connected);
  chip.classList.toggle('off', !connected);
}

function updateModeChip(mode) {
  const chip = document.getElementById('modeChip');
  if (!chip) return;
  chip.textContent = mode === 'qa' ? 'QA' : 'Interview';
}

// Wire up tab buttons after DOM loads
document.addEventListener('DOMContentLoaded', () => {
  const tabLive = document.getElementById('tabLive');
  const tabCode = document.getElementById('tabCode');
  const tabHistory = document.getElementById('tabHistory');
  const tabSettings = document.getElementById('tabSettings');

  if (tabLive) tabLive.addEventListener('click', () => setActiveTab('live'));
  if (tabCode) tabCode.addEventListener('click', () => setActiveTab('code'));
  if (tabHistory) tabHistory.addEventListener('click', () => setActiveTab('history'));
  if (tabSettings) tabSettings.addEventListener('click', () => setActiveTab('settings'));
});

ipcRenderer.on("transcription", (event, text) => {
  if (!text.trim()) return;
  
  currentQuestion = text;
  captionEl.innerText = text;
  statusEl.innerText = "Status: listening...";
  
  // If we were showing a previous answer, add it to history
  if (currentAnswer) {
    addToHistory('assistant', currentAnswer);
    currentAnswer = '';
  }
});

ipcRenderer.on("connection-status", (event, status) => {
  statusEl.innerText = status === "connected"
    ? "Status: connected, listening..."
    : "Status: disconnected";

  // Update status chip
  updateConnChip(status === 'connected');
});

ipcRenderer.on("error", (event, err) => {
  statusEl.innerText = "⚠️ " + err;
});

// Handle mode changes from transcription pipeline
ipcRenderer.on("mode-change", (event, mode) => {
  if (mode === "qa") {
    statusEl.innerText = "Mode: QA (code)";
  } else {
    statusEl.innerText = "Mode: interview";
  }
  updateModeChip(mode);
});

ipcRenderer.on("gemini-response", (event, text) => {
  if (!text.trim()) return;
  
  currentAnswer = text;
  const intent = lastAskedIsCode || isCodeIntent(currentQuestion);
  const parts = splitExplanationAndCode(text);
  let code = parts.code;
  let explanation = parts.explanation;
  if (!code && intent) {
    // Treat full as code when intent is code but no fence present
    code = text;
    // Keep the same text as explanation so user still sees an answer in Live
    explanation = text;
  }
  if (code) {
    if (codeAnswer) codeAnswer.textContent = code;
    if (aiEl) aiEl.textContent = explanation || "Code answer available in Code tab";
    setActiveTab('code');
  } else {
    if (aiEl) aiEl.textContent = text;
    if (codeAnswer) codeAnswer.textContent = "";
    setActiveTab('live');
  }
  statusEl.innerText = "Status: AI updated";
  // Reset flag after handling
  lastAskedIsCode = false;
  
  // If we have both question and answer, add them to history
  if (currentQuestion) {
    addToHistory('user', currentQuestion);
    addToHistory('assistant', currentAnswer);
    currentQuestion = '';
    currentAnswer = '';
  }
});

ipcRenderer.on("qa-response", (event, text) => {
  if (text) {
    addToHistory('assistant', text);
    const intent = lastAskedIsCode || isCodeIntent(currentQuestion);
    const parts = splitExplanationAndCode(text);
    let code = parts.code;
    let explanation = parts.explanation;
    if (!code && intent) {
      code = text;
      explanation = text;
    }
    if (code) {
      if (codeAnswer) codeAnswer.textContent = code;
      if (aiEl) aiEl.textContent = explanation || "Code answer available in Code tab";
      setActiveTab('code');
    } else {
      if (aiEl) aiEl.textContent = text;
      if (codeAnswer) codeAnswer.textContent = "";
      setActiveTab('live');
    }
    isProcessing = false;
    lastAskedIsCode = false;
  }
});

// Detect if a text likely requests code output
function isCodeIntent(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  const verbNoun = /(write|show|give|create|generate|build|make|provide|implement|produce|print|example|sample)\b[\s\S]{0,40}\b(code|snippet|program|script|function|class|module|algorithm)/i;
  const programTo = /(program|script)\s+to\b/i;
  const lang = /(python|py|javascript|js|node|typescript|java|c\+\+|c#|c|go|rust|ruby|php)/i;
  const langCombo = new RegExp(`${lang.source}[^\n]{0,30}(code|snippet|program|script|function|class)`, 'i');
  const langVerb = new RegExp(`(write|create|generate|build|make|implement)[^\n]{0,30}${lang.source}`, 'i');
  return verbNoun.test(t) || programTo.test(t) || langCombo.test(t) || langVerb.test(t);
}

// Helper: extract fenced code block content
function extractFencedCode(text) {
  if (!text) return null;
  const m = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
  return m ? m[1] : null;
}

// Split response into explanation (before first fenced code) and code (inside fence)
function splitExplanationAndCode(text) {
  if (!text) return { explanation: '', code: '' };
  const fence = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
  if (!fence) return { explanation: text.trim(), code: '' };
  const idx = text.indexOf(fence[0]);
  const explanation = text.slice(0, idx).trim();
  const code = fence[1];
  return { explanation, code };
}

// Start transcription
startBtn.addEventListener("click", () => {
  const assemblyKey = document.getElementById("assemblyKey").value.trim();
  const geminiKey = document.getElementById("geminiKey").value.trim();
  const geminiModel = document.getElementById("geminiModel").value.trim();

  if (!assemblyKey || !geminiKey) {
    statusEl.innerText = "Please enter both API keys.";
    return;
  }

  // Show the stop button
  if (stopBtn) stopBtn.style.display = 'block';

  ipcRenderer.invoke("start-transcription", {
    apiKey: assemblyKey,
    geminiKey,
    geminiModel,
    deviceName: "CABLE Output (VB-Audio Virtual Cable)",
  }).then(res => {
    if (!res.success) {
      statusEl.innerText = "Error starting transcription: " + res.error;
      if (stopBtn) stopBtn.style.display = 'none';
    }
    // On success, switch to Live tab
    if (res && res.success) {
      isStarted = true;
      setActiveTab('live');
    }
  });
});

// Stop transcription
stopBtn.addEventListener("click", () => {
  ipcRenderer.invoke("stop-transcription");
  statusEl.innerText = "Stopped";
  // Switch back to Settings and update visibility
  if (stopBtn) stopBtn.style.display = 'none';
  setActiveTab('settings');
  isStarted = false;
});

// Tab switching helpers
function setActiveTab(tab) {
  const tabs = [
    { btn: document.getElementById('tabLive'), panel: document.getElementById('panel-live'), key: 'live' },
    { btn: document.getElementById('tabCode'), panel: document.getElementById('panel-code'), key: 'code' },
    { btn: document.getElementById('tabHistory'), panel: document.getElementById('panel-history'), key: 'history' },
    { btn: document.getElementById('tabSettings'), panel: document.getElementById('panel-settings'), key: 'settings' },
  ];

  tabs.forEach(({ btn, panel, key }) => {
    if (!btn || !panel) return;
    if (key === tab) {
      btn.classList.add('active');
      panel.classList.add('active');
    } else {
      btn.classList.remove('active');
      panel.classList.remove('active');
    }
  });

  // When switching to History, scroll to bottom once for convenience
  if (tab === 'history') {
    const scrollContainer = document.querySelector('.scroll-container');
    if (scrollContainer) {
      smoothScrollTo(scrollContainer, scrollContainer.scrollHeight);
    }
  }
}

// Replace gear button toggle: jump to Settings tab (guard if element absent)
if (gearBtn) {
  gearBtn.addEventListener("click", () => {
    setActiveTab('settings');
  });
}

// Smooth scroll to target element with improved accuracy
function smoothScrollTo(element, targetPosition, duration = 200) {
  const startPosition = element.scrollTop;
  const distance = targetPosition - startPosition;
  let startTime = null;
  
  // If there's no distance to scroll, return immediately
  if (Math.abs(distance) < 1) return;

  function animation(currentTime) {
    if (!startTime) startTime = currentTime;
    const timeElapsed = currentTime - startTime;
    const progress = Math.min(timeElapsed / duration, 1);
    
    // Use a more aggressive easing function for better control
    const easeProgress = progress < 0.5 
      ? 2 * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    const newPosition = startPosition + (distance * easeProgress);
    
    // Use scrollTo for better cross-browser compatibility
    element.scrollTo({
      top: newPosition,
      behavior: 'instant'
    });
    
    if (timeElapsed < duration) {
      requestAnimationFrame(animation);
    } else {
      // Ensure we reach exactly the target
      element.scrollTop = targetPosition;
    }
  }

  requestAnimationFrame(animation);
}

// Toggle API key visibility for inputs with eye buttons
function setupEyeToggles() {
  const buttons = document.querySelectorAll('.eye-btn');

  const eyeSVG = (
    '<svg class="eye-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '  <path fill="currentColor" d="M12 5c-7.633 0-11 7-11 7s3.367 7 11 7 11-7 11-7-3.367-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5A2.5 2.5 0 1 0 12 7.5 2.5 2.5 0 0 0 12 14.5z"/>' +
    '</svg>'
  );
  const eyeOffSVG = (
    '<svg class="eye-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '  <path fill="currentColor" d="M12 5c-7.633 0-11 7-11 7s3.367 7 11 7 11-7 11-7-3.367-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/>' +
    '  <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2"/>' +
    '</svg>'
  );

  buttons.forEach(btn => {
    const targetId = btn.getAttribute('data-target');
    const input = document.getElementById(targetId);
    if (!input) return;

    const setVisual = () => {
      const hidden = input.type === 'password';
      btn.innerHTML = hidden ? eyeSVG : eyeOffSVG;
      btn.setAttribute('aria-pressed', hidden ? 'false' : 'true');
      btn.title = hidden ? 'Show API key' : 'Hide API key';
      btn.setAttribute('aria-label', hidden ? 'Show API key' : 'Hide API key');
    };

    // Initialize state on load
    setVisual();

    btn.addEventListener('click', () => {
      const willShow = input.type === 'password';
      input.type = willShow ? 'text' : 'password';
      setVisual();
    });
  });
}

// Add message to conversation history
function addToHistory(role, text) {
  if (!text.trim()) return;
  
  const historyEl = document.getElementById('conversationHistory');
  const scrollContainer = document.querySelector('.scroll-container');
  if (!historyEl || !scrollContainer) {
    console.error('Conversation history element not found');
    return;
  }
  // Determine if user is near the bottom (within 60px) on the OUTER scroll container
  const isNearBottom = (scrollContainer.scrollTop + scrollContainer.clientHeight) >= (scrollContainer.scrollHeight - 60);

  const messageEl = document.createElement('div');
  messageEl.className = `message ${role}`;
  messageEl.textContent = text;
  
  // Add message to the conversation
  historyEl.appendChild(messageEl);
  
  // Force reflow to ensure the element is in the DOM
  void messageEl.offsetHeight;
  
  // Auto-scroll only if the user was already near the bottom (scroll the OUTER container)
  if (isNearBottom) {
    smoothScrollTo(scrollContainer, scrollContainer.scrollHeight);
  }
}

// Add initial test messages if needed
function testScrollFunctionality() {
  const historyEl = document.getElementById('conversationHistory');
  if (!historyEl || historyEl.children.length > 0) return;
  
  // Add a single welcome message
  const welcomeMsg = document.createElement('div');
  welcomeMsg.className = 'message';
  welcomeMsg.textContent = 'Welcome to the interview. The conversation will appear here.';
  historyEl.appendChild(welcomeMsg);
}

// Handle ask input (focus only; Enter handled below)
function handleAskInput() {
  const askInput = document.getElementById('askInput');
  if (askInput) {
    askInput.tabIndex = 0;
    askInput.focus();
  }
}

// Close button functionality
const closeBtn = document.getElementById('closeBtn');
if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    ipcRenderer.send('close-window');
  });
}

// Minimize button functionality
const minBtn = document.getElementById('minBtn');
if (minBtn) {
  minBtn.addEventListener('click', () => {
    ipcRenderer.send('minimize-window');
  });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  
  // Set initial visibility
  if (stopBtn) stopBtn.style.display = 'none';
  // Default to Settings tab on load
  setActiveTab('settings');
  
  // Initialize ask input functionality
  handleAskInput();
  
  // Add test messages
  const historyEl = document.getElementById('conversationHistory');
  if (historyEl && historyEl.children.length === 0) {
    testScrollFunctionality();
  }
  
  // Initialize API key eye toggles
  setupEyeToggles();
});

// Handle Enter key in ask input
askInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    askBtn.click();
  }
});

// Manual Q&A send
askBtn.addEventListener("click", () => {
  const question = askInput.value.trim();
  if (!question) {
    statusEl.innerText = "Please enter a question.";
    return;
  }
  // Require Start to be pressed with valid keys first
  if (!isStarted) {
    statusEl.innerText = "Please enter API keys in Settings and press Start first.";
    setActiveTab('settings');
    return;
  }
  
  // Clear the input field after sending
  askInput.value = '';

  if (isProcessing) {
    statusEl.innerText = "Please wait for the current request to complete.";
    return;
  }

  isProcessing = true;
  statusEl.innerText = "Asking Gemini...";
  
  // Add user question to history immediately
  addToHistory('user', question);
  
  // Mark if the user explicitly requested code
  lastAskedIsCode = isCodeIntent(question);

  ipcRenderer.invoke("ask-gemini", question).then(res => {
    if (!res.success) {
      statusEl.innerText = "Error: " + res.error;
      isProcessing = false;
      return;
    }
    statusEl.innerText = "AI answered.";
    askInput.value = "";
    askInput.focus();
  }).catch(err => {
    statusEl.innerText = "Error: " + (err.message || 'Unknown error');
    isProcessing = false;
  });
});
// src/renderer/renderer.js
