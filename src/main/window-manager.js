const { BaseWindow, WebContentsView, ipcMain } = require('electron');
const path = require('path');

async function createWindow() {
  // Create main window
  const mainWindow = new BaseWindow({
    width: 1600,
    height: 900,
    show: false,
    backgroundColor: '#e0e0e0', // Light gray for separators
    icon: path.join(__dirname, '../../assets/icons/icon.icns'),
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

  // Create ChatGPT view (top-left)
  const chatgptView = new WebContentsView({
    webPreferences: {
      partition: 'persist:shared',
      preload: path.join(__dirname, '../preload/chatgpt-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Create Gemini view (top-right)
  const geminiView = new WebContentsView({
    webPreferences: {
      partition: 'persist:shared',
      preload: path.join(__dirname, '../preload/gemini-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Create Perplexity view (top-right)
  const perplexityView = new WebContentsView({
    webPreferences: {
      partition: 'persist:shared',
      preload: path.join(__dirname, '../preload/perplexity-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Set User-Agent to avoid browser detection issues
  perplexityView.webContents.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  );

  // Create Claude view (bottom-right)
  const claudeView = new WebContentsView({
    webPreferences: {
      partition: 'persist:shared',
      preload: path.join(__dirname, '../preload/claude-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Add views to window
  mainWindow.contentView.addChildView(chatgptView);
  mainWindow.contentView.addChildView(geminiView);
  mainWindow.contentView.addChildView(perplexityView);
  mainWindow.contentView.addChildView(claudeView);
  mainWindow.contentView.addChildView(mainView);

  // Set bounds for views (updated on resize)
  function updateBounds() {
    const bounds = mainWindow.getContentBounds();
    const width = bounds.width;
    const height = bounds.height;
    const controlBarHeight = 100; // Height reserved for control bar
    const chatAreaHeight = height - controlBarHeight;

    const halfWidth = Math.floor(width / 2);
    const halfHeight = Math.floor(chatAreaHeight / 2);
    const gap = 1; // 1px gap for separators

    // Top-left: Claude
    claudeView.setBounds({
      x: 0,
      y: 0,
      width: halfWidth - Math.floor(gap / 2),
      height: halfHeight - Math.floor(gap / 2),
    });

    // Top-right: Perplexity
    perplexityView.setBounds({
      x: halfWidth + Math.ceil(gap / 2),
      y: 0,
      width: width - halfWidth - Math.ceil(gap / 2),
      height: halfHeight - Math.floor(gap / 2),
    });

    // Bottom-left: ChatGPT
    chatgptView.setBounds({
      x: 0,
      y: halfHeight + Math.ceil(gap / 2),
      width: halfWidth - Math.floor(gap / 2),
      height: chatAreaHeight - halfHeight - Math.ceil(gap / 2),
    });

    // Bottom-right: Gemini
    geminiView.setBounds({
      x: halfWidth + Math.ceil(gap / 2),
      y: halfHeight + Math.ceil(gap / 2),
      width: width - halfWidth - Math.ceil(gap / 2),
      height: chatAreaHeight - halfHeight - Math.ceil(gap / 2),
    });

    // Bottom control bar - full width
    mainView.setBounds({
      x: 0,
      y: chatAreaHeight,
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
  perplexityView.webContents.loadURL('https://www.perplexity.ai');
  claudeView.webContents.loadURL('https://claude.ai');

  // Forward console messages from all views to terminal
  chatgptView.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[ChatGPT] ${message}`);
  });
  geminiView.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Gemini] ${message}`);
  });
  perplexityView.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Perplexity] ${message}`);
  });
  claudeView.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Claude] ${message}`);
  });
  mainView.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[ControlBar] ${message}`);
  });

  // Open dev tools in development
  if (process.argv.includes('--dev')) {
    chatgptView.webContents.openDevTools({ mode: 'detach' });
    geminiView.webContents.openDevTools({ mode: 'detach' });
    perplexityView.webContents.openDevTools({ mode: 'detach' });
    claudeView.webContents.openDevTools({ mode: 'detach' });
    mainView.webContents.openDevTools({ mode: 'detach' });
  }

  // Initial bounds calculation
  setTimeout(updateBounds, 100);

  mainWindow.show();

  // Store references for access in main process
  mainWindow.mainView = mainView;
  mainWindow.chatgptView = chatgptView;
  mainWindow.geminiView = geminiView;
  mainWindow.perplexityView = perplexityView;
  mainWindow.claudeView = claudeView;

  return mainWindow;
}

module.exports = { createWindow };
