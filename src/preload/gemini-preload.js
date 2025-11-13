const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Load selectors config
let config = {};
try {
  const configPath = path.join(__dirname, '../../config/selectors.json');
  const configData = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configData);
} catch (error) {
  console.error('Failed to load selectors config:', error);
}

let inputElement = null;
let submitElement = null;
let lastText = '';

// Find element by trying multiple selectors
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
      // Invalid selector, continue
      continue;
    }
  }
  return null;
}

// Find the actual text input within rich-textarea or contenteditable
function findGeminiInput(element) {
  if (!element) return null;

  // If it's a rich-textarea custom element, look for contenteditable inside
  if (element.tagName === 'RICH-TEXTAREA') {
    const contenteditable = element.querySelector('[contenteditable="true"]');
    if (contenteditable) return contenteditable;
  }

  // If it's already contenteditable, look for the paragraph element
  if (element.contentEditable === 'true') {
    const paragraph = element.querySelector('p');
    if (paragraph) return paragraph;
    return element;
  }

  // Otherwise return as-is
  return element;
}

// Inject text into the input element
function injectText(text) {
  // Always rescan input element in case user switched chats
  const rawElement = findElement(config.gemini?.input);
  inputElement = findGeminiInput(rawElement);

  if (!inputElement) {
    ipcRenderer.invoke('selector-error', 'gemini', 'Input element not found');
    return;
  }

  lastText = text;

  // Handle different element types
  if (inputElement.tagName === 'TEXTAREA') {
    inputElement.value = text;
    inputElement.selectionStart = text.length;
    inputElement.selectionEnd = text.length;
  } else if (inputElement.contentEditable === 'true' || inputElement.tagName === 'P') {
    // Handle contenteditable (Quill editor) - preserve newlines as <br>
    // Clear existing content - avoid innerHTML due to TrustedHTML CSP
    while (inputElement.firstChild) {
      inputElement.removeChild(inputElement.firstChild);
    }

    // Split by newlines and create text nodes with <br> between them
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      inputElement.appendChild(document.createTextNode(line));
      if (index < lines.length - 1) {
        inputElement.appendChild(document.createElement('br'));
      }
    });
  } else if (inputElement.tagName === 'INPUT') {
    inputElement.value = text;
  } else {
    inputElement.textContent = text;
  }

  const events = [
    new Event('input', { bubbles: true }),
    new Event('change', { bubbles: true }),
    new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key: 'a',
    }),
  ];

  events.forEach((event) => inputElement.dispatchEvent(event));
}

function submitMessage() {
  // Always rescan submit button in case DOM changed
  submitElement = findElement(config.gemini?.submit);

  if (submitElement) {
    submitElement.click();
    // Clear cached reference after click
    submitElement = null;
  } else {
    // Fallback: try Enter key
    if (!inputElement) {
      const rawElement = findElement(config.gemini?.input);
      inputElement = findGeminiInput(rawElement);
    }
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
}

// Listen for text updates from main window
ipcRenderer.on('text-update', (event, text) => {
  if (text !== lastText) {
    injectText(text);
  }
});

// Listen for submit signal
ipcRenderer.on('submit-message', () => {
  submitMessage();
});

// Listen for new chat signal
ipcRenderer.on('new-chat', () => {
  const newChatButton = findElement(config.gemini?.newChat);
  if (newChatButton) {
    newChatButton.click();
  } else {
    console.warn('[Gemini] New chat button not found');
  }
});

let scanAttempts = 0;
const scanInterval = setInterval(() => {
  if (!inputElement && scanAttempts < 10) {
    const rawElement = findElement(config.gemini?.input);
    inputElement = findGeminiInput(rawElement);
    scanAttempts++;
  } else {
    clearInterval(scanInterval);
  }
}, 500);

// Store view information
let viewInfo = null;

// Inject UI controls (supersize button + provider dropdown)
function createUIControls() {
  if (!viewInfo) return; // Wait for view info

  // Create container
  const container = document.createElement('div');
  container.id = 'polygpt-controls';
  Object.assign(container.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    display: 'flex',
    gap: '8px',
    zIndex: '999999',
  });

  // Create provider dropdown
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
    cursor: 'pointer',
    backdropFilter: 'blur(4px)',
    transition: 'all 0.2s ease',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
  });

  // Populate dropdown with providers
  viewInfo.availableProviders.forEach(provider => {
    const option = document.createElement('option');
    option.value = provider.key;
    option.textContent = provider.name;
    option.selected = provider.key === viewInfo.provider;
    dropdown.appendChild(option);
  });

  dropdown.addEventListener('change', async () => {
    try {
      await ipcRenderer.invoke('change-provider', viewInfo.position, dropdown.value);
    } catch (error) {
      console.error('Failed to change provider:', error);
    }
  });

  dropdown.addEventListener('mouseenter', () => {
    dropdown.style.background = 'rgba(0, 0, 0, 0.7)';
  });

  dropdown.addEventListener('mouseleave', () => {
    dropdown.style.background = 'rgba(0, 0, 0, 0.5)';
  });

  // Create supersize button
  const button = document.createElement('button');
  button.id = 'polygpt-supersize-btn';
  button.title = 'Expand/Collapse';

  // Create icon spans without using innerHTML to avoid CSP issues
  const expandIcon = document.createElement('span');
  expandIcon.className = 'icon-expand';
  expandIcon.textContent = '⛶';

  const collapseIcon = document.createElement('span');
  collapseIcon.className = 'icon-collapse';
  collapseIcon.textContent = '⬓';
  collapseIcon.style.display = 'none';

  button.appendChild(expandIcon);
  button.appendChild(collapseIcon);

  Object.assign(button.style, {
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '6px',
    background: 'rgba(0, 0, 0, 0.5)',
    color: 'white',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
    transition: 'all 0.2s ease',
  });

  button.addEventListener('mouseenter', () => {
    button.style.background = 'rgba(0, 0, 0, 0.7)';
    button.style.transform = 'scale(1.1)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.background = 'rgba(0, 0, 0, 0.5)';
    button.style.transform = 'scale(1)';
  });

  button.addEventListener('mousedown', () => {
    button.style.transform = 'scale(0.95)';
  });

  button.addEventListener('mouseup', () => {
    button.style.transform = 'scale(1.1)';
  });

  button.addEventListener('click', async () => {
    try {
      await ipcRenderer.invoke('toggle-supersize', viewInfo.position);
    } catch (error) {
      console.error('Failed to toggle supersize:', error);
    }
  });

  // Add to container
  container.appendChild(dropdown);
  container.appendChild(button);
  document.body.appendChild(container);
}

// Listen for view information
ipcRenderer.on('view-info', (event, info) => {
  viewInfo = info;
  // Create UI controls if DOM is ready
  if (document.body) {
    createUIControls();
  }
});

// Listen for supersize state changes
ipcRenderer.on('supersize-state-changed', (event, supersizedPosition) => {
  const button = document.getElementById('polygpt-supersize-btn');
  if (!button || !viewInfo) return;

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

// Create loading overlay
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

  // Add keyframes animation
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

// Wait for DOM to be ready before injecting controls
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (viewInfo) createUIControls();
  });
} else if (viewInfo) {
  createUIControls();
}
