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
  } else if (inputElement.contentEditable === 'true' || inputElement.tagName === 'P') {
    // Clear existing content and set text
    inputElement.textContent = text;
  } else if (inputElement.tagName === 'INPUT') {
    inputElement.value = text;
  } else {
    // Try innerHTML for richtext
    inputElement.innerHTML = escapeHtml(text);
  }

  // Dispatch events to trigger React/framework detection
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

// Escape HTML to prevent injection
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Handle submit/send button
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

// Rescan selectors when needed
function rescanSelectors() {
  inputElement = null;
  submitElement = null;
  console.log('[Gemini] Selectors rescanned');
}

// Expose safe API via contextBridge
contextBridge.exposeInMainWorld('geminiApi', {
  rescanSelectors,
});

// Periodically rescan selectors if not found
let scanAttempts = 0;
const scanInterval = setInterval(() => {
  if (!inputElement && scanAttempts < 10) {
    const rawElement = findElement(config.gemini?.input);
    inputElement = findGeminiInput(rawElement);
    scanAttempts++;
  } else if (inputElement) {
    clearInterval(scanInterval);
  }
}, 500);
