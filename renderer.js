// renderer.js
const { ipcRenderer } = require("electron");

const captionEl = document.getElementById("caption");
const aiEl = document.getElementById("aiResponse");
const statusEl = document.getElementById("status");
const configPanel = document.getElementById("configPanel");
const gearBtn = document.getElementById("gearBtn");
const stopBtn = document.getElementById("stopBtn");
const startBtn = document.getElementById("startBtn");

ipcRenderer.on("transcription", (event, text) => {
  captionEl.innerText = text;
  statusEl.innerText = "Status: listening...";
});

ipcRenderer.on("connection-status", (event, status) => {
  statusEl.innerText = status === "connected"
    ? "Status: connected, listening..."
    : "Status: disconnected";
});

ipcRenderer.on("error", (event, err) => {
  statusEl.innerText = "⚠️ " + err;
});

ipcRenderer.on("gemini-response", (event, text) => {
  aiEl.innerText = text;
  statusEl.innerText = "Status: AI updated";
});

// Start transcription
startBtn.addEventListener("click", () => {
  const assemblyKey = document.getElementById("assemblyKey").value.trim();
  const geminiKey = document.getElementById("geminiKey").value.trim();
  const geminiModel = document.getElementById("geminiModel").value.trim();

  if (!assemblyKey || !geminiKey) {
    statusEl.innerText = "Please enter both API keys.";
    return;
  }

  configPanel.classList.add("hidden");

  ipcRenderer.invoke("start-transcription", {
    apiKey: assemblyKey,
    geminiKey,
    geminiModel,
    deviceName: "CABLE Output (VB-Audio Virtual Cable)",
  }).then(res => {
    if (!res.success) {
      statusEl.innerText = "Error starting transcription: " + res.error;
      configPanel.classList.remove("hidden");
    }
  });
});

// Stop transcription
stopBtn.addEventListener("click", () => {
  ipcRenderer.invoke("stop-transcription");
  statusEl.innerText = "Stopped";
  configPanel.classList.remove("hidden");
});

// Toggle settings panel
gearBtn.addEventListener("click", () => {
  configPanel.classList.toggle("hidden");
});
