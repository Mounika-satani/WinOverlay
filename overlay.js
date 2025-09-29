// // overlay.js
// const { BrowserWindow } = require("electron");

// function createOverlay() {
//   const overlayWindow = new BrowserWindow({
//     width: 600,
//     height: 340,
//     alwaysOnTop: true,
//     transparent: true,
//     frame: false,
//     resizable: true,
//     movable: true,
//     webPreferences: {
//       nodeIntegration: true,
//       contextIsolation: false,
//     },
//   });

//   overlayWindow.loadFile("overlay.html");

//   // Exclude from screen share (optional)
//   try {
//     const affinity = require("./native/build/Release/display_affinity.node");
//     const hwnd = overlayWindow.getNativeWindowHandle().readBigInt64LE();
//     affinity.exclude(Number(hwnd));
//   } catch (e) {
//     console.warn("⚠️ Display affinity not loaded, overlay may show in screen share.");
//   }

//   return overlayWindow;
// }

// module.exports = { createOverlay };

const { BrowserWindow, app, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

function createOverlay() {
  // Create the overlay window
  const overlayWindow = new BrowserWindow({
    width: 600,
    height: 340,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    resizable: true,
    movable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  overlayWindow.loadFile("overlay.html");

  try {
    let nativeModulePath;

    if (app.isPackaged) {
      // Path for packaged build
      nativeModulePath = path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "native",
        "build",
        "Release",
        "display_affinity.node"
      );
    } else {
      // Path for development
      nativeModulePath = path.join(
        __dirname,
        "native",
        "build",
        "Release",
        "display_affinity.node"
      );
    }

    // Load the native module
    const affinity = require(nativeModulePath);
    const hwnd = overlayWindow.getNativeWindowHandle().readBigInt64LE();
    affinity.exclude(Number(hwnd)); // Hide overlay from screen share
  } catch (e) {
    console.warn(
      "⚠️ Display affinity not loaded, overlay may show in screen share.",
      e
    );
  }

  return overlayWindow;
}


module.exports = { createOverlay };

