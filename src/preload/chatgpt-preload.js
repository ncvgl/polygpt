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
  } else if (inputElement.contentEditable === 'true') {
    // Handle contenteditable div
    inputElement.textContent = text;
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
