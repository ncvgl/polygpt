const { app, BaseWindow, ipcMain } = require('electron');
const path = require('path');
const windowManager = require('./window-manager');

let mainWindow;
let currentZoomFactor = 1.0;

app.on('ready', async () => {
  mainWindow = await windowManager.createWindow();

  // IPC handler for text updates from renderer
  ipcMain.handle('send-text-update', async (event, text) => {
    // Send text to all 4 preload scripts
    if (mainWindow.chatgptView && mainWindow.chatgptView.webContents) {
      mainWindow.chatgptView.webContents.send('text-update', text);
    }
    if (mainWindow.geminiView && mainWindow.geminiView.webContents) {
      mainWindow.geminiView.webContents.send('text-update', text);
    }
    if (mainWindow.perplexityView && mainWindow.perplexityView.webContents) {
      mainWindow.perplexityView.webContents.send('text-update', text);
    }
    if (mainWindow.claudeView && mainWindow.claudeView.webContents) {
      mainWindow.claudeView.webContents.send('text-update', text);
    }
  });

  // Forward errors from preload scripts back to renderer
  ipcMain.handle('selector-error', async (event, source, error) => {
    if (mainWindow.mainView && mainWindow.mainView.webContents) {
      mainWindow.mainView.webContents.send('selector-error', { source, error });
    }
  });

  // Handle refresh pages request
  ipcMain.handle('refresh-pages', async (event) => {
    if (mainWindow.chatgptView && mainWindow.chatgptView.webContents) {
      mainWindow.chatgptView.webContents.reload();
    }
    if (mainWindow.geminiView && mainWindow.geminiView.webContents) {
      mainWindow.geminiView.webContents.reload();
    }
    if (mainWindow.perplexityView && mainWindow.perplexityView.webContents) {
      mainWindow.perplexityView.webContents.reload();
    }
    if (mainWindow.claudeView && mainWindow.claudeView.webContents) {
      mainWindow.claudeView.webContents.reload();
    }
    return true;
  });

  // Handle submit message request
  ipcMain.handle('submit-message', async (event) => {
    if (mainWindow.chatgptView && mainWindow.chatgptView.webContents) {
      mainWindow.chatgptView.webContents.send('submit-message');
    }
    if (mainWindow.geminiView && mainWindow.geminiView.webContents) {
      mainWindow.geminiView.webContents.send('submit-message');
    }
    if (mainWindow.perplexityView && mainWindow.perplexityView.webContents) {
      mainWindow.perplexityView.webContents.send('submit-message');
    }
    if (mainWindow.claudeView && mainWindow.claudeView.webContents) {
      mainWindow.claudeView.webContents.send('submit-message');
    }
    return true;
  });

  // Handle new chat request
  ipcMain.handle('new-chat', async (event) => {
    if (mainWindow.chatgptView && mainWindow.chatgptView.webContents) {
      mainWindow.chatgptView.webContents.send('new-chat');
    }
    if (mainWindow.geminiView && mainWindow.geminiView.webContents) {
      mainWindow.geminiView.webContents.send('new-chat');
    }
    if (mainWindow.perplexityView && mainWindow.perplexityView.webContents) {
      mainWindow.perplexityView.webContents.send('new-chat');
    }
    if (mainWindow.claudeView && mainWindow.claudeView.webContents) {
      mainWindow.claudeView.webContents.send('new-chat');
    }
    return true;
  });

  // Handle zoom in request
  ipcMain.handle('zoom-in', async (event) => {
    const newZoom = Math.min(currentZoomFactor + 0.1, 2.0); // Max 200%
    currentZoomFactor = newZoom;

    if (mainWindow.chatgptView && mainWindow.chatgptView.webContents) {
      mainWindow.chatgptView.webContents.setZoomFactor(newZoom);
    }
    if (mainWindow.geminiView && mainWindow.geminiView.webContents) {
      mainWindow.geminiView.webContents.setZoomFactor(newZoom);
    }
    if (mainWindow.perplexityView && mainWindow.perplexityView.webContents) {
      mainWindow.perplexityView.webContents.setZoomFactor(newZoom);
    }
    if (mainWindow.claudeView && mainWindow.claudeView.webContents) {
      mainWindow.claudeView.webContents.setZoomFactor(newZoom);
    }

    return newZoom;
  });

  // Handle zoom out request
  ipcMain.handle('zoom-out', async (event) => {
    const newZoom = Math.max(currentZoomFactor - 0.1, 0.5); // Min 50%
    currentZoomFactor = newZoom;

    if (mainWindow.chatgptView && mainWindow.chatgptView.webContents) {
      mainWindow.chatgptView.webContents.setZoomFactor(newZoom);
    }
    if (mainWindow.geminiView && mainWindow.geminiView.webContents) {
      mainWindow.geminiView.webContents.setZoomFactor(newZoom);
    }
    if (mainWindow.perplexityView && mainWindow.perplexityView.webContents) {
      mainWindow.perplexityView.webContents.setZoomFactor(newZoom);
    }
    if (mainWindow.claudeView && mainWindow.claudeView.webContents) {
      mainWindow.claudeView.webContents.setZoomFactor(newZoom);
    }

    return newZoom;
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (mainWindow === null) {
    mainWindow = await windowManager.createWindow();
  }
});

