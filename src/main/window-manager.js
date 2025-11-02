const { BaseWindow, WebContentsView, ipcMain } = require('electron');
const path = require('path');

async function createWindow() {
  // Create main window
  const mainWindow = new BaseWindow({
    width: 1600,
    height: 900,
    show: false,
  });

  // Maximize the window
  mainWindow.maximize();

  // Create main renderer content view (control bar)
  const mainView = new WebContentsView({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Create left ChatGPT view
  const chatgptView = new WebContentsView({
    webPreferences: {
      partition: 'persist:shared',
      preload: path.join(__dirname, '../preload/chatgpt-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Create right Gemini view
  const geminiView = new WebContentsView({
    webPreferences: {
      partition: 'persist:shared',
      preload: path.join(__dirname, '../preload/gemini-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Add views to window
  mainWindow.contentView.addChildView(chatgptView);
  mainWindow.contentView.addChildView(geminiView);
  mainWindow.contentView.addChildView(mainView);

  // Set bounds for views (updated on resize)
  function updateBounds() {
    const bounds = mainWindow.getContentBounds();
    const width = bounds.width;
    const height = bounds.height;
    const controlBarHeight = 100; // Height reserved for control bar
    const chatHeight = height - controlBarHeight;

    // Left ChatGPT - 50% width
    chatgptView.setBounds({
      x: 0,
      y: 0,
      width: Math.floor(width / 2),
      height: chatHeight,
    });

    // Right Gemini - 50% width
    geminiView.setBounds({
      x: Math.floor(width / 2),
      y: 0,
      width: width - Math.floor(width / 2),
      height: chatHeight,
    });

    // Bottom control bar - full width
    mainView.setBounds({
      x: 0,
      y: chatHeight,
      width: width,
      height: controlBarHeight,
    });
  }

  // Update bounds on window resize
  mainWindow.on('resized', updateBounds);

  // Load content
  mainView.webContents.loadFile(path.join(__dirname, '../renderer/index.html'));
  chatgptView.webContents.loadURL('https://chat.openai.com');
  geminiView.webContents.loadURL('https://gemini.google.com');

  // Open dev tools in development
  if (process.argv.includes('--dev')) {
    chatgptView.webContents.openDevTools({ mode: 'detach' });
    geminiView.webContents.openDevTools({ mode: 'detach' });
    mainView.webContents.openDevTools({ mode: 'detach' });
  }

  // Initial bounds calculation
  setTimeout(updateBounds, 100);

  mainWindow.show();

  // Store references for access in main process
  mainWindow.chatgptView = chatgptView;
  mainWindow.geminiView = geminiView;

  return mainWindow;
}

module.exports = { createWindow };
