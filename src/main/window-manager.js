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

  // Track which view is supersized (null = normal grid)
  let supersizedView = null;

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

    if (supersizedView === null) {
      // Normal 2x2 grid mode
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
    } else {
      // Supersized mode: one view takes 80%, others are thumbnails
      const mainWidth = Math.floor(width * 0.8);
      const thumbnailWidth = width - mainWidth - 2; // 2px gap
      const thumbnailHeight = Math.floor(chatAreaHeight / 3);
      const gap = 1;

      const views = {
        claude: claudeView,
        perplexity: perplexityView,
        chatgpt: chatgptView,
        gemini: geminiView,
      };

      // Position supersized view
      const supersized = views[supersizedView];
      supersized.setBounds({
        x: 0,
        y: 0,
        width: mainWidth,
        height: chatAreaHeight,
      });

      // Position thumbnails vertically on the right
      const thumbnails = Object.entries(views).filter(([id]) => id !== supersizedView);
      thumbnails.forEach(([id, view], index) => {
        view.setBounds({
          x: mainWidth + 2,
          y: index * (thumbnailHeight + gap),
          width: thumbnailWidth,
          height: thumbnailHeight - (index < thumbnails.length - 1 ? gap : 0),
        });
      });
    }

    // Bottom control bar - full width
    mainView.setBounds({
      x: 0,
      y: chatAreaHeight,
      width: width,
      height: controlBarHeight,
    });
  }

  // Toggle supersize for a view
  function toggleSupersize(viewId) {
    if (supersizedView === viewId) {
      supersizedView = null;
    } else {
      supersizedView = viewId;
    }
    updateBounds();

    // Notify all service views of state change
    claudeView.webContents.send('supersize-state-changed', supersizedView);
    perplexityView.webContents.send('supersize-state-changed', supersizedView);
    chatgptView.webContents.send('supersize-state-changed', supersizedView);
    geminiView.webContents.send('supersize-state-changed', supersizedView);

    return supersizedView;
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
  mainWindow.toggleSupersize = toggleSupersize;
  mainWindow.getSupersizedView = () => supersizedView;

  return mainWindow;
}

module.exports = { createWindow };
