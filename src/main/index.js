const { app, ipcMain } = require('electron');
const windowManager = require('./window-manager');

let mainWindow;
let currentZoomFactor = 1.0;

app.on('ready', async () => {
  mainWindow = await windowManager.createWindow();

  // IPC handler for text updates from renderer
  ipcMain.handle('send-text-update', async (event, text) => {
    const supersizedPosition = mainWindow.getSupersizedPosition ? mainWindow.getSupersizedPosition() : null;

    // If supersized, only send to that position
    if (supersizedPosition) {
      const view = mainWindow.viewPositions[supersizedPosition];
      if (view && view.webContents) {
        view.webContents.send('text-update', text);
      }
    } else {
      // Send text to all positions
      windowManager.POSITIONS.forEach(pos => {
        const view = mainWindow.viewPositions[pos];
        if (view && view.webContents) {
          view.webContents.send('text-update', text);
        }
      });
    }
  });

  ipcMain.handle('selector-error', async (event, source, error) => {
    if (mainWindow.mainView && mainWindow.mainView.webContents) {
      mainWindow.mainView.webContents.send('selector-error', { source, error });
    }
  });

  ipcMain.handle('rescan-selectors', async (event) => {
    windowManager.POSITIONS.forEach(pos => {
      const view = mainWindow.viewPositions[pos];
      if (view && view.webContents) {
        view.webContents.reload();
      }
    });
    return true;
  });

  ipcMain.handle('refresh-pages', async (event) => {
    const reloadPromises = windowManager.POSITIONS.map(pos => {
      return new Promise((resolve) => {
        const view = mainWindow.viewPositions[pos];
        if (view && view.webContents) {
          const onLoad = () => {
            view.webContents.setZoomFactor(currentZoomFactor);
            view.webContents.removeListener('did-finish-load', onLoad);
            resolve();
          };
          view.webContents.on('did-finish-load', onLoad);
          view.webContents.reload();
        } else {
          resolve();
        }
      });
    });
    await Promise.all(reloadPromises);
    return true;
  });

  // Handle submit message request
  ipcMain.handle('submit-message', async (event) => {
    const supersizedPosition = mainWindow.getSupersizedPosition ? mainWindow.getSupersizedPosition() : null;

    // If supersized, only submit to that position
    if (supersizedPosition) {
      const view = mainWindow.viewPositions[supersizedPosition];
      if (view && view.webContents) {
        view.webContents.send('submit-message');
      }
    } else {
      // Submit to all positions
      windowManager.POSITIONS.forEach(pos => {
        const view = mainWindow.viewPositions[pos];
        if (view && view.webContents) {
          view.webContents.send('submit-message');
        }
      });
    }
    return true;
  });

  // Handle new chat request
  ipcMain.handle('new-chat', async (event) => {
    windowManager.POSITIONS.forEach(pos => {
      const view = mainWindow.viewPositions[pos];
      if (view && view.webContents) {
        view.webContents.send('new-chat');
      }
    });
    return true;
  });

  // Handle zoom in request
  ipcMain.handle('zoom-in', async (event) => {
    const newZoom = Math.min(currentZoomFactor + 0.1, 2.0); // Max 200%
    currentZoomFactor = newZoom;

    windowManager.POSITIONS.forEach(pos => {
      const view = mainWindow.viewPositions[pos];
      if (view && view.webContents) {
        view.webContents.setZoomFactor(newZoom);
      }
    });

    return newZoom;
  });

  // Handle zoom out request
  ipcMain.handle('zoom-out', async (event) => {
    const newZoom = Math.max(currentZoomFactor - 0.1, 0.5); // Min 50%
    currentZoomFactor = newZoom;

    windowManager.POSITIONS.forEach(pos => {
      const view = mainWindow.viewPositions[pos];
      if (view && view.webContents) {
        view.webContents.setZoomFactor(newZoom);
      }
    });

    return newZoom;
  });

  // Handle toggle supersize request
  ipcMain.handle('toggle-supersize', async (event, position) => {
    if (mainWindow.toggleSupersize) {
      const supersizedPosition = mainWindow.toggleSupersize(position);
      return supersizedPosition;
    }
    return null;
  });

  // Handle change provider request
  ipcMain.handle('change-provider', async (event, position, newProvider) => {
    if (mainWindow.changeProvider) {
      return mainWindow.changeProvider(position, newProvider, currentZoomFactor);
    }
    return false;
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

