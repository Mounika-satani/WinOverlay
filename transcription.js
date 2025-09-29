// // transcription.js
// const WebSocket = require("ws");
// const ffmpeg = require("ffmpeg-static");
// const { spawn } = require("child_process");

// let recording;
// let ws;
// let overlayWindow;

// let transcriptBuffer = "";
// let bufferTimer = null;
// const flushIntervalMs = 2500;

// let currentGeminiKey = null;
// let currentGeminiModel = "gemini-2.5-flash";

// // ===== Audio Capture =====
// function startAudioCapture(deviceName = "CABLE Output (VB-Audio Virtual Cable)") {
//   recording = spawn(ffmpeg, [
//     "-f", "dshow",
//     "-i", `audio=${deviceName}`,
//     "-ac", "1",
//     "-ar", "16000",
//     "-f", "s16le",
//     "pipe:1",
//   ]);

//   recording.stdout.on("data", (chunk) => sendAudioData(chunk));
//   recording.stderr.on("data", (data) => console.log("FFmpeg:", data.toString()));
//   recording.on("close", (code) => console.log("FFmpeg exited with code:", code));
// }

// function stopAudioCapture() {
//   if (recording) {
//     recording.kill("SIGINT");
//     recording = null;
//   }
// }

// // ===== AssemblyAI =====
// function startTranscription(assemblyKey, deviceName) {
//   const SAMPLE_RATE = 16000;
//   ws = new WebSocket(
//     `wss://streaming.assemblyai.com/v3/ws?sample_rate=${SAMPLE_RATE}&encoding=pcm_s16le`,
//     { headers: { authorization: assemblyKey } }
//   );

//   ws.on("open", () => {
//     console.log("✅ WebSocket connected");
//     overlayWindow.webContents.send("connection-status", "connected");
//     startAudioCapture(deviceName);
//     startBufferTimer();
//   });

//   ws.on("message", (msg) => {
//     try {
//       const data = JSON.parse(msg.toString());
//       if (data.type === "Turn" && data.transcript) {
//         console.log("📝 Transcript:", data.transcript);
//         overlayWindow.webContents.send("transcription", data.transcript);
//         appendToBuffer(data.transcript);
//       }
//     } catch (e) {
//       console.error("❌ Error parsing message:", e);
//     }
//   });

//   ws.on("close", () => {
//     console.log("🔌 WebSocket closed");
//     overlayWindow.webContents.send("connection-status", "disconnected");
//     stopAudioCapture();
//     stopBufferTimer();
//   });

//   ws.on("error", (err) => {
//     console.error("⚠️ WebSocket error:", err);
//     overlayWindow.webContents.send("error", err.message);
//   });
// }

// function stopTranscription() {
//   if (ws && ws.readyState === ws.OPEN) {
//     ws.send(JSON.stringify({ terminate_session: true }));
//     ws.close();
//   }
//   ws = null;
//   stopAudioCapture();
//   stopBufferTimer();
// }

// // ===== Send Audio =====
// function sendAudioData(audioBuffer) {
//   if (ws && ws.readyState === ws.OPEN) {
//     ws.send(audioBuffer);
//   }
// }

// // ===== Buffer Helpers =====
// function appendToBuffer(text) {
//   if (!text?.trim()) return;
//   transcriptBuffer += (transcriptBuffer ? " " : "") + text.trim();
// }

// function startBufferTimer() {
//   if (bufferTimer) return;
//   bufferTimer = setInterval(() => {
//     flushBufferToGemini().catch((err) => {
//       console.error("Error flushing buffer:", err);
//       overlayWindow.webContents.send("error", "Gemini flush error: " + (err.message || err));
//     });
//   }, flushIntervalMs);
//   console.log("Buffer timer started (every " + flushIntervalMs + "ms)");
// }

// function stopBufferTimer() {
//   if (bufferTimer) {
//     clearInterval(bufferTimer);
//     bufferTimer = null;
//     console.log("Buffer timer stopped");
//   }
// }

// // ===== Conversation Memory =====
// let conversationHistory = [
//   {
//     role: "user",
//     parts: [{
//       text: "You are my interview assistant. Always generate short, direct, professional first-person answers (3-4 sentences max). Do not explain, repeat the question, or add extra context. Only give the answer."
//     }]
//   }
// ];

// function addToHistory(role, text) {
//   conversationHistory.push({
//     role,
//     parts: [{ text }]
//   });

//   // Trim old messages to avoid huge payloads
//   if (conversationHistory.length > 20) {
//     conversationHistory = conversationHistory.slice(-20);
//   }
// }

// // ===== Gemini =====
// async function flushBufferToGemini() {
//   const toSend = transcriptBuffer.trim();
//   if (!toSend) return;
//   transcriptBuffer = "";

//   try {
//     // Save interviewer input to memory with explicit brevity instruction
//     addToHistory("user", `Interviewer: ${toSend}\n\nAnswer briefly in first person (max 2–3 sentences).`);

//     const aiReply = await callGemini();

//     // Save Gemini reply to memory
//     addToHistory("model", aiReply);

//     // Send trimmed response to overlay
//     overlayWindow.webContents.send("gemini-response", trimReply(aiReply));
//   } catch (err) {
//     console.error("Gemini API error:", err);
//     overlayWindow.webContents.send("error", "Gemini API error: " + (err.message || err));
//   }
// }

// async function callGemini() {
//   if (!currentGeminiKey) throw new Error("Gemini API key missing. Enter it in overlay.");

//   const payload = {
//     contents: conversationHistory,
//     generationConfig: {
//       thinkingConfig: { thinkingBudget: 0 },
//       maxOutputTokens: 100,   // keep replies short
//     },
//   };

//   const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentGeminiModel)}:generateContent`;

//   const res = await fetch(url, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       "x-goog-api-key": currentGeminiKey,
//     },
//     body: JSON.stringify(payload),
//   });

//   if (!res.ok) throw new Error(`Gemini API returned ${res.status}: ${await res.text()}`);

//   const data = await res.json();
//   return (
//     data?.candidates?.[0]?.content?.parts?.[0]?.text ||
//     data?.candidates?.[0]?.text ||
//     JSON.stringify(data)
//   );
// }

// // ===== Helper: Trim response =====
// function trimReply(reply) {
//   if (!reply) return "";
//   // Take only the first 2 sentences max
//   const sentences = reply.split(/(?<=[.!?])\s+/).slice(0, 2);
//   return sentences.join(" ");
// }


// // ===== Exports =====
// function start(window, { apiKey, deviceName, geminiKey, geminiModel }) {
//   overlayWindow = window;
//   if (geminiKey) currentGeminiKey = geminiKey;
//   if (geminiModel) currentGeminiModel = geminiModel;
//   startTranscription(apiKey, deviceName);
//   return { success: true };
// }

// function stop() {
//   stopTranscription();
//   return { success: true };
// }

// module.exports = { start, stop };

// transcription.js
const WebSocket = require("ws");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const { spawn } = require("child_process");

let recording;
let ws;
let overlayWindow;

let transcriptBuffer = "";
let bufferTimer = null;
const flushIntervalMs = 2500;

let currentGeminiKey = null;
let currentGeminiModel = "gemini-2.5-flash";

// ===== Resolve ffmpeg binary correctly (packaged + dev) =====
function resolveFfmpeg() {
  if (!ffmpegPath) throw new Error("FFmpeg binary not found!");
  // In packaged apps, asar may hide the exe → unpacked is needed
  return ffmpegPath.replace("app.asar", "app.asar.unpacked");
}

// ===== Audio Capture =====
function startAudioCapture(deviceName = "CABLE Output (VB-Audio Virtual Cable)") {
  const ffmpeg = resolveFfmpeg();

  recording = spawn(ffmpeg, [
    "-f", "dshow",
    "-i", `audio=${deviceName}`,
    "-ac", "1",
    "-ar", "16000",
    "-f", "s16le",
    "pipe:1",
  ]);

  recording.stdout.on("data", (chunk) => sendAudioData(chunk));
  recording.stderr.on("data", (data) => console.log("FFmpeg:", data.toString()));
  recording.on("error", (err) => console.error("FFmpeg spawn error:", err));
  recording.on("close", (code) => console.log("FFmpeg exited with code:", code));
}

function stopAudioCapture() {
  if (recording) {
    recording.kill("SIGINT");
    recording = null;
  }
}

// ===== AssemblyAI =====
function startTranscription(assemblyKey, deviceName) {
  const SAMPLE_RATE = 16000;
  ws = new WebSocket(
    `wss://streaming.assemblyai.com/v3/ws?sample_rate=${SAMPLE_RATE}&encoding=pcm_s16le`,
    { headers: { authorization: assemblyKey } }
  );

  ws.on("open", () => {
    console.log("✅ WebSocket connected");
    overlayWindow.webContents.send("connection-status", "connected");
    startAudioCapture(deviceName);
    startBufferTimer();
  });

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === "Turn" && data.transcript) {
        console.log("📝 Transcript:", data.transcript);
        overlayWindow.webContents.send("transcription", data.transcript);
        appendToBuffer(data.transcript);
      }
    } catch (e) {
      console.error("❌ Error parsing message:", e);
    }
  });

  ws.on("close", () => {
    console.log("🔌 WebSocket closed");
    overlayWindow.webContents.send("connection-status", "disconnected");
    stopAudioCapture();
    stopBufferTimer();
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket error:", err);
    overlayWindow.webContents.send("error", err.message);
  });
}

function stopTranscription() {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ terminate_session: true }));
    ws.close();
  }
  ws = null;
  stopAudioCapture();
  stopBufferTimer();
}

// ===== Send Audio =====
function sendAudioData(audioBuffer) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(audioBuffer);
  }
}

// ===== Buffer Helpers =====
function appendToBuffer(text) {
  if (!text?.trim()) return;
  transcriptBuffer += (transcriptBuffer ? " " : "") + text.trim();
}

function startBufferTimer() {
  if (bufferTimer) return;
  bufferTimer = setInterval(() => {
    flushBufferToGemini().catch((err) => {
      console.error("Error flushing buffer:", err);
      overlayWindow.webContents.send("error", "Gemini flush error: " + (err.message || err));
    });
  }, flushIntervalMs);
  console.log("Buffer timer started (every " + flushIntervalMs + "ms)");
}

function stopBufferTimer() {
  if (bufferTimer) {
    clearInterval(bufferTimer);
    bufferTimer = null;
    console.log("Buffer timer stopped");
  }
}

// ===== Conversation Memory =====
let conversationHistory = [
  {
    role: "user",
    parts: [{
      text: "You are my interview assistant. Always generate short, direct, professional first-person answers (3-4 sentences max). Do not explain, repeat the question, or add extra context. Only give the answer."
    }]
  }
];

function addToHistory(role, text) {
  conversationHistory.push({
    role,
    parts: [{ text }]
  });

  // Trim old messages
  if (conversationHistory.length > 20) {
    conversationHistory = conversationHistory.slice(-20);
  }
}

// ===== Gemini =====
async function flushBufferToGemini() {
  const toSend = transcriptBuffer.trim();
  if (!toSend) return;
  transcriptBuffer = "";

  try {
    addToHistory("user", `Interviewer: ${toSend}\n\nAnswer briefly in first person (max 2–3 sentences).`);
    const aiReply = await callGemini();
    addToHistory("model", aiReply);
    overlayWindow.webContents.send("gemini-response", trimReply(aiReply));
  } catch (err) {
    console.error("Gemini API error:", err);
    overlayWindow.webContents.send("error", "Gemini API error: " + (err.message || err));
  }
}

async function callGemini() {
  if (!currentGeminiKey) throw new Error("Gemini API key missing. Enter it in overlay.");

  const payload = {
    contents: conversationHistory,
    generationConfig: {
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 100,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentGeminiModel)}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": currentGeminiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Gemini API returned ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    data?.candidates?.[0]?.text ||
    JSON.stringify(data)
  );
}

// ===== Helper: Trim response =====
function trimReply(reply) {
  if (!reply) return "";
  const sentences = reply.split(/(?<=[.!?])\s+/).slice(0, 2);
  return sentences.join(" ");
}

// ===== Exports =====
function start(window, { apiKey, deviceName, geminiKey, geminiModel }) {
  overlayWindow = window;
  if (geminiKey) currentGeminiKey = geminiKey;
  if (geminiModel) currentGeminiModel = geminiModel;
  startTranscription(apiKey, deviceName);
  return { success: true };
}

function stop() {
  stopTranscription();
  return { success: true };
}

module.exports = { start, stop };

