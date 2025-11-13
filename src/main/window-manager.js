const { BaseWindow, WebContentsView } = require('electron');
const path = require('path');
const fs = require('fs');

// Provider metadata
const PROVIDERS = {
  chatgpt: {
    url: 'https://chat.openai.com',
    preload: 'chatgpt-preload.js',
    name: 'ChatGPT',
    userAgent: null,
  },
  gemini: {
    url: 'https://gemini.google.com',
    preload: 'gemini-preload.js',
    name: 'Gemini',
    userAgent: null,
  },
  perplexity: {
    url: 'https://www.perplexity.ai',
    preload: 'perplexity-preload.js',
    name: 'Perplexity',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  },
  claude: {
    url: 'https://claude.ai',
    preload: 'claude-preload.js',
    name: 'Claude',
    userAgent: null,
  },
};

// Position keys
const POSITIONS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

// Config file path
const CONFIG_PATH = path.join(__dirname, '../../config/window-providers.json');

// Load provider configuration
function loadProviderConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load provider config:', error);
  }
  // Return default configuration
  return {
    topLeft: 'claude',
    topRight: 'perplexity',
    bottomLeft: 'chatgpt',
    bottomRight: 'gemini',
  };
}

// Save provider configuration
function saveProviderConfig(config) {
  try {
    const configDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to save provider config:', error);
  }
}

// Create a provider view
function createProviderView(providerKey, position) {
  const provider = PROVIDERS[providerKey];
  if (!provider) {
    throw new Error(`Unknown provider: ${providerKey}`);
  }

  const view = new WebContentsView({
    webPreferences: {
      partition: 'persist:shared',
      preload: path.join(__dirname, `../preload/${provider.preload}`),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Set user agent if specified
  if (provider.userAgent) {
    view.webContents.setUserAgent(provider.userAgent);
  }

  // Track provider and position
  view.providerKey = providerKey;
  view.position = position;

  // Load URL
  view.webContents.loadURL(provider.url);

  return view;
}

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

  // Track which position is supersized (null = normal grid)
  let supersizedPosition = null;

  // Load provider configuration
  const providerConfig = loadProviderConfig();

  // Create main renderer content view (control bar)
  const mainView = new WebContentsView({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Create views based on configuration
  const viewPositions = {
    topLeft: createProviderView(providerConfig.topLeft, 'topLeft'),
    topRight: createProviderView(providerConfig.topRight, 'topRight'),
    bottomLeft: createProviderView(providerConfig.bottomLeft, 'bottomLeft'),
    bottomRight: createProviderView(providerConfig.bottomRight, 'bottomRight'),
  };

  // Add views to window
  mainWindow.contentView.addChildView(viewPositions.topLeft);
  mainWindow.contentView.addChildView(viewPositions.topRight);
  mainWindow.contentView.addChildView(viewPositions.bottomLeft);
  mainWindow.contentView.addChildView(viewPositions.bottomRight);
  mainWindow.contentView.addChildView(mainView);

  // Set bounds for views (updated on resize)
  function updateBounds() {
    const bounds = mainWindow.getContentBounds();
    const width = bounds.width;
    const height = bounds.height;
    const controlBarHeight = 100; // Height reserved for control bar
    const chatAreaHeight = height - controlBarHeight;

    if (supersizedPosition === null) {
      // Normal 2x2 grid mode
      const halfWidth = Math.floor(width / 2);
      const halfHeight = Math.floor(chatAreaHeight / 2);
      const gap = 1; // 1px gap for separators

      // Top-left
      viewPositions.topLeft.setBounds({
        x: 0,
        y: 0,
        width: halfWidth - Math.floor(gap / 2),
        height: halfHeight - Math.floor(gap / 2),
      });

      // Top-right
      viewPositions.topRight.setBounds({
        x: halfWidth + Math.ceil(gap / 2),
        y: 0,
        width: width - halfWidth - Math.ceil(gap / 2),
        height: halfHeight - Math.floor(gap / 2),
      });

      // Bottom-left
      viewPositions.bottomLeft.setBounds({
        x: 0,
        y: halfHeight + Math.ceil(gap / 2),
        width: halfWidth - Math.floor(gap / 2),
        height: chatAreaHeight - halfHeight - Math.ceil(gap / 2),
      });

      // Bottom-right
      viewPositions.bottomRight.setBounds({
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

      // Position supersized view
      const supersized = viewPositions[supersizedPosition];
      supersized.setBounds({
        x: 0,
        y: 0,
        width: mainWidth,
        height: chatAreaHeight,
      });

      // Position thumbnails vertically on the right
      const thumbnails = POSITIONS.filter(pos => pos !== supersizedPosition);
      thumbnails.forEach((pos, index) => {
        viewPositions[pos].setBounds({
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

  // Toggle supersize for a position
  function toggleSupersize(position) {
    if (supersizedPosition === position) {
      supersizedPosition = null;
    } else {
      supersizedPosition = position;
    }
    updateBounds();

    // Notify all service views of state change
    POSITIONS.forEach(pos => {
      viewPositions[pos].webContents.send('supersize-state-changed', supersizedPosition);
    });

    return supersizedPosition;
  }

  // Change provider for a position
  function changeProvider(position, newProviderKey) {
    // Get old view
    const oldView = viewPositions[position];

    // Remove from window
    mainWindow.contentView.removeChildView(oldView);

    // Close old view
    oldView.webContents.close();

    // Create new view
    const newView = createProviderView(newProviderKey, position);

    // Add to window
    mainWindow.contentView.addChildView(newView);

    // Update reference
    viewPositions[position] = newView;

    // Setup console forwarding for new view
    newView.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[${PROVIDERS[newProviderKey].name}@${position}] ${message}`);
    });

    // Send view info to new view after it loads
    newView.webContents.on('did-finish-load', () => {
      newView.webContents.send('view-info', {
        position,
        provider: newProviderKey,
        availableProviders: Object.keys(PROVIDERS).map(key => ({
          key,
          name: PROVIDERS[key].name,
        })),
      });
    });

    // Update bounds
    updateBounds();

    // Update config
    providerConfig[position] = newProviderKey;
    saveProviderConfig(providerConfig);

    // Notify all views of supersize state
    POSITIONS.forEach(pos => {
      viewPositions[pos].webContents.send('supersize-state-changed', supersizedPosition);
    });

    return true;
  }

  // Update bounds on window resize
  mainWindow.on('resized', updateBounds);

  // Load content
  mainView.webContents.loadFile(path.join(__dirname, '../renderer/index.html'));
  // URLs are already loaded in createProviderView()

  // Forward console messages from all views to terminal
  POSITIONS.forEach(pos => {
    viewPositions[pos].webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[${PROVIDERS[viewPositions[pos].providerKey].name}@${pos}] ${message}`);
    });

    // Send position and provider info to each view after it loads
    viewPositions[pos].webContents.on('did-finish-load', () => {
      viewPositions[pos].webContents.send('view-info', {
        position: pos,
        provider: viewPositions[pos].providerKey,
        availableProviders: Object.keys(PROVIDERS).map(key => ({
          key,
          name: PROVIDERS[key].name,
        })),
      });
    });
  });

  mainView.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[ControlBar] ${message}`);
  });

  // Open dev tools in development
  if (process.argv.includes('--dev')) {
    POSITIONS.forEach(pos => {
      viewPositions[pos].webContents.openDevTools({ mode: 'detach' });
    });
    mainView.webContents.openDevTools({ mode: 'detach' });
  }

  // Initial bounds calculation
  setTimeout(updateBounds, 100);

  mainWindow.show();

  // Store references for access in main process
  mainWindow.mainView = mainView;
  mainWindow.viewPositions = viewPositions;
  mainWindow.toggleSupersize = toggleSupersize;
  mainWindow.changeProvider = changeProvider;
  mainWindow.getSupersizedPosition = () => supersizedPosition;

  return mainWindow;
}

module.exports = { createWindow, PROVIDERS, POSITIONS };
