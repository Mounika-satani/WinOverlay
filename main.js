// main.js
const { app, ipcMain } = require("electron");
const { createOverlay } = require("./overlay");
const transcription = require("./transcription");

let overlayWindow;

app.whenReady().then(() => {
  overlayWindow = createOverlay();
});
// IPC for checking VB-Cable
ipcMain.handle("check-vbcable", async () => {
  return isVBCableInstalled();
});

// IPC handlers
ipcMain.handle("start-transcription", (event, args) =>
  transcription.start(overlayWindow, args)
);

ipcMain.handle("stop-transcription", () => transcription.stop());

// Lifecycle cleanup
app.on("window-all-closed", () => {
  transcription.stop();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  transcription.stop();
});
