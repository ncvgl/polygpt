const { app, BaseWindow, ipcMain } = require('electron');
const path = require('path');
const windowManager = require('./window-manager');

let mainWindow;

app.on('ready', async () => {
  mainWindow = await windowManager.createWindow();

  // IPC handler for text updates from renderer
  ipcMain.handle('send-text-update', async (event, text) => {
    // Send text to both preload scripts
    if (mainWindow.chatgptView && mainWindow.chatgptView.webContents) {
      mainWindow.chatgptView.webContents.send('text-update', text);
    }
    if (mainWindow.geminiView && mainWindow.geminiView.webContents) {
      mainWindow.geminiView.webContents.send('text-update', text);
    }
  });

  // Forward errors from preload scripts back to renderer
  ipcMain.handle('selector-error', async (event, source, error) => {
    mainWindow.contentView.webContents.send('selector-error', { source, error });
  });

  // Handle refresh pages request
  ipcMain.handle('refresh-pages', async (event) => {
    if (mainWindow.chatgptView && mainWindow.chatgptView.webContents) {
      mainWindow.chatgptView.webContents.reload();
    }
    if (mainWindow.geminiView && mainWindow.geminiView.webContents) {
      mainWindow.geminiView.webContents.reload();
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
    return true;
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

