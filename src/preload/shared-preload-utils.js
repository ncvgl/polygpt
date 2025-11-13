const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

function loadConfig() {
  try {
    const configPath = path.join(__dirname, '../../config/selectors.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('Failed to load selectors config:', error);
    return {};
  }
}

function findElement(selectors) {
  if (!Array.isArray(selectors)) {
    selectors = [selectors];
  }

  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    } catch (error) {
      continue;
    }
  }
  return null;
}

function createSubmitHandler(provider, config, getInputElement, getSubmitElement) {
  return function submitMessage() {
    const submitElement = findElement(config[provider]?.submit);

    if (submitElement) {
      submitElement.click();
    } else {
      const inputElement = getInputElement();
      if (inputElement) {
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          bubbles: true,
          cancelable: true,
        });
        inputElement.dispatchEvent(enterEvent);
      }
    }
  };
}

function setupIPCListeners(provider, config, injectTextFn, submitFn, lastText) {
  ipcRenderer.on('text-update', (event, text) => {
    if (text !== lastText.value) {
      injectTextFn(text);
    }
  });

  ipcRenderer.on('submit-message', () => {
    submitFn();
  });

  ipcRenderer.on('new-chat', () => {
    const newChatButton = findElement(config[provider]?.newChat);
    if (newChatButton) {
      newChatButton.click();
    } else {
      console.warn(`[${provider.charAt(0).toUpperCase() + provider.slice(1)}] New chat button not found`);
    }
  });
}

function setupInputScanner(provider, config, getInputElement, setInputElement, findInputFn) {
  let scanAttempts = 0;
  const scanInterval = setInterval(() => {
    if (!getInputElement() && scanAttempts < 10) {
      const element = findInputFn ? findInputFn(config[provider]?.input) : findElement(config[provider]?.input);
      setInputElement(element);
      scanAttempts++;
    } else {
      clearInterval(scanInterval);
    }
  }, 500);
}

function createUIControls(viewInfo) {
  const existingContainer = document.getElementById('polygpt-controls-container');
  if (existingContainer) {
    existingContainer.remove();
  }

  const container = document.createElement('div');
  container.id = 'polygpt-controls-container';
  Object.assign(container.style, {
    position: 'fixed',
    top: '10px',
    right: '10px',
    display: 'flex',
    gap: '8px',
    zIndex: '9999999',
    pointerEvents: 'auto',
  });

  const dropdown = document.createElement('select');
  dropdown.id = 'polygpt-provider-dropdown';
  dropdown.title = 'Switch Provider';
  Object.assign(dropdown.style, {
    border: 'none',
    borderRadius: '6px',
    background: 'rgba(0, 0, 0, 0.5)',
    color: 'white',
    fontSize: '14px',
    padding: '8px',
    height: '36px',
    cursor: 'pointer',
    backdropFilter: 'blur(4px)',
    transition: 'all 0.2s ease',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
  });

  viewInfo.availableProviders.forEach(provider => {
    const option = document.createElement('option');
    option.value = provider.key;
    option.textContent = provider.name;
    if (provider.key === viewInfo.provider) {
      option.selected = true;
    }
    dropdown.appendChild(option);
  });

  dropdown.addEventListener('change', async () => {
    await ipcRenderer.invoke('change-provider', viewInfo.position, dropdown.value);
  });

  dropdown.addEventListener('mouseenter', () => {
    dropdown.style.background = 'rgba(0, 0, 0, 0.7)';
  });

  dropdown.addEventListener('mouseleave', () => {
    dropdown.style.background = 'rgba(0, 0, 0, 0.5)';
  });

  const button = document.createElement('button');
  button.id = 'polygpt-supersize-btn';
  button.title = 'Supersize / Restore';
  Object.assign(button.style, {
    border: 'none',
    borderRadius: '6px',
    background: 'rgba(0, 0, 0, 0.5)',
    color: 'white',
    width: '36px',
    height: '36px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
    transition: 'all 0.2s ease',
    padding: '0',
    fontSize: '16px',
  });

  const expandIcon = document.createElement('span');
  expandIcon.className = 'icon-expand';
  expandIcon.textContent = '⛶';
  expandIcon.style.display = 'block';

  const collapseIcon = document.createElement('span');
  collapseIcon.className = 'icon-collapse';
  collapseIcon.textContent = '◱';
  collapseIcon.style.display = 'none';

  button.appendChild(expandIcon);
  button.appendChild(collapseIcon);

  button.addEventListener('mouseenter', () => {
    button.style.background = 'rgba(0, 0, 0, 0.7)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.background = 'rgba(0, 0, 0, 0.5)';
  });

  button.addEventListener('mousedown', () => {
    button.style.transform = 'scale(0.95)';
  });

  button.addEventListener('mouseup', () => {
    button.style.transform = 'scale(1)';
  });

  button.addEventListener('click', async () => {
    await ipcRenderer.invoke('toggle-supersize', viewInfo.position);
  });

  container.appendChild(dropdown);
  container.appendChild(button);
  document.body.appendChild(container);
}

function setupViewInfoListener(createUIControlsFn) {
  let viewInfo = null;

  ipcRenderer.on('view-info', (event, info) => {
    viewInfo = info;
    if (document.body) {
      createUIControlsFn(info);
    }
  });

  return () => viewInfo;
}

function setupSupersizeListener() {
  ipcRenderer.on('supersize-state-changed', (event, supersizedPosition) => {
    const button = document.getElementById('polygpt-supersize-btn');
    const viewInfoGetter = window.polygptGetViewInfo;

    if (!button || !viewInfoGetter) return;

    const viewInfo = viewInfoGetter();
    if (!viewInfo) return;

    const expandIcon = button.querySelector('.icon-expand');
    const collapseIcon = button.querySelector('.icon-collapse');

    if (supersizedPosition === viewInfo.position) {
      expandIcon.style.display = 'none';
      collapseIcon.style.display = 'block';
    } else {
      expandIcon.style.display = 'block';
      collapseIcon.style.display = 'none';
    }
  });
}

function createLoadingOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'polygpt-loading-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    background: 'rgba(255, 255, 255, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '9999999',
    backdropFilter: 'blur(4px)',
  });

  const spinner = document.createElement('div');
  Object.assign(spinner.style, {
    width: '50px',
    height: '50px',
    border: '4px solid rgba(0, 0, 0, 0.1)',
    borderTop: '4px solid rgba(0, 0, 0, 0.6)',
    borderRadius: '50%',
    animation: 'polygpt-spin 1s linear infinite',
  });

  const style = document.createElement('style');
  style.textContent = `
    @keyframes polygpt-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  overlay.appendChild(spinner);
  document.body.appendChild(overlay);

  return overlay;
}

function setupLoadingOverlay() {
  let loadingOverlay = null;
  if (document.body) {
    loadingOverlay = createLoadingOverlay();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      loadingOverlay = createLoadingOverlay();
    });
  }

  window.addEventListener('load', () => {
    if (loadingOverlay) {
      loadingOverlay.style.opacity = '0';
      loadingOverlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        if (loadingOverlay && loadingOverlay.parentNode) {
          loadingOverlay.parentNode.removeChild(loadingOverlay);
        }
        loadingOverlay = null;
      }, 300);
    }
  });
}

function waitForDOM(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}

module.exports = {
  loadConfig,
  findElement,
  createSubmitHandler,
  setupIPCListeners,
  setupInputScanner,
  createUIControls,
  setupViewInfoListener,
  setupSupersizeListener,
  createLoadingOverlay,
  setupLoadingOverlay,
  waitForDOM,
};
