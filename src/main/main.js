// src/main/main.js
const { app, ipcMain, BrowserWindow } = require("electron");
const { createOverlay } = require("./overlay");
const transcription = require("./transcription");

let overlayWindow;

// Function to check if VB-Cable is installed
function isVBCableInstalled() {
  // Implementation should be here or imported from another module
  return false; // Default implementation
}

// IPC for checking VB-Cable
ipcMain.handle("check-vbcable", async () => {
  return isVBCableInstalled();
});

// IPC handlers
ipcMain.handle("start-transcription", (event, args) =>
  transcription.start(overlayWindow, args)
);

ipcMain.handle("stop-transcription", () => transcription.stop());

// Handle window close request
ipcMain.on('close-window', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
});

// Handle window minimize request
ipcMain.on('minimize-window', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.minimize();
  }
});

// Lifecycle
app.whenReady().then(() => {
  overlayWindow = createOverlay();
});

// Lifecycle cleanup
app.on("window-all-closed", () => {
  transcription.stop();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  transcription.stop();
});

// --- NEW: manual Q&A ---
ipcMain.handle("ask-gemini", async (event, question) => {
  try {
    const answer = await transcription.askGemini(question);
    overlayWindow.webContents.send("qa-response", answer);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
