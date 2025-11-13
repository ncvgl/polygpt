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

// Inject text into the input element
function injectText(text) {
  // Always rescan input element in case user switched chats
  inputElement = findElement(config.chatgpt?.input);

  if (!inputElement) {
    ipcRenderer.invoke('selector-error', 'chatgpt', 'Input element not found');
    return;
  }

  lastText = text;

  // Handle textarea
  if (inputElement.tagName === 'TEXTAREA') {
    inputElement.value = text;
    // Set selection to end of text
    inputElement.selectionStart = text.length;
    inputElement.selectionEnd = text.length;
  } else if (inputElement.contentEditable === 'true') {
    // Handle contenteditable div (ProseMirror) - preserve newlines as <br>
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
  }

  // Dispatch events to trigger React/framework detection
  const events = [
    new Event('input', { bubbles: true }),
    new Event('change', { bubbles: true }),
    new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key: 'a', // arbitrary key
    }),
  ];

  events.forEach((event) => inputElement.dispatchEvent(event));
}

// Handle submit/send button
function submitMessage() {
  // Always rescan submit button in case DOM changed
  submitElement = findElement(config.chatgpt?.submit);

  if (submitElement) {
    submitElement.click();
    // Clear cached reference after click
    submitElement = null;
  } else {
    // Fallback: try Enter key
    if (!inputElement) {
      inputElement = findElement(config.chatgpt?.input);
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
  const newChatButton = findElement(config.chatgpt?.newChat);
  if (newChatButton) {
    newChatButton.click();
  } else {
    console.warn('[ChatGPT] New chat button not found');
  }
});

// Rescan selectors when needed
function rescanSelectors() {
  inputElement = null;
  submitElement = null;
  console.log('[ChatGPT] Selectors rescanned');
}

// Expose safe API via contextBridge
contextBridge.exposeInMainWorld('chatgptApi', {
  rescanSelectors,
});

// Periodically rescan selectors if not found
let scanAttempts = 0;
const scanInterval = setInterval(() => {
  if (!inputElement && scanAttempts < 10) {
    inputElement = findElement(config.chatgpt?.input);
    scanAttempts++;
  } else if (inputElement) {
    clearInterval(scanInterval);
  }
}, 500);

// Inject supersize button
function createSupersizeButton() {
  const button = document.createElement('button');
  button.id = 'polygpt-supersize-btn';
  button.innerHTML = '<span class="icon-expand">⛶</span><span class="icon-collapse" style="display:none">⬓</span>';
  button.title = 'Expand/Collapse';

  // Apply styles
  Object.assign(button.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
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
    zIndex: '999999',
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
      await ipcRenderer.invoke('toggle-supersize', 'chatgpt');
    } catch (error) {
      console.error('Failed to toggle supersize:', error);
    }
  });

  document.body.appendChild(button);
  return button;
}

// Listen for supersize state changes
ipcRenderer.on('supersize-state-changed', (event, supersizedView) => {
  const button = document.getElementById('polygpt-supersize-btn');
  if (!button) return;

  const expandIcon = button.querySelector('.icon-expand');
  const collapseIcon = button.querySelector('.icon-collapse');

  if (supersizedView === 'chatgpt') {
    expandIcon.style.display = 'none';
    collapseIcon.style.display = 'block';
  } else {
    expandIcon.style.display = 'block';
    collapseIcon.style.display = 'none';
  }
});

// Wait for DOM to be ready before injecting button
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createSupersizeButton);
} else {
  createSupersizeButton();
}
