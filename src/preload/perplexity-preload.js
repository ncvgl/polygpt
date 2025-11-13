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
  inputElement = findElement(config.perplexity?.input);

  if (!inputElement) {
    console.error('[Perplexity] Input element not found. Tried selectors:', config.perplexity?.input);
    ipcRenderer.invoke('selector-error', 'perplexity', 'Input element not found');
    return;
  }

  console.log('[Perplexity] Found input element:', inputElement.tagName, inputElement.id, inputElement.className);

  // Focus the element first
  inputElement.focus();

  // Handle textarea
  if (inputElement.tagName === 'TEXTAREA') {
    inputElement.value = text;
    inputElement.selectionStart = text.length;
    inputElement.selectionEnd = text.length;
  } else if (inputElement.contentEditable === 'true') {
    // Lexical editor - incremental updates to avoid duplication
    // Get current content in Perplexity
    const currentContent = inputElement.textContent || '';

    if (text === lastText && text === currentContent) {
      // No change, skip
      return;
    } else if (text.length === 0) {
      // User cleared all text (Ctrl+A+Delete or cleared input)
      if (currentContent.length > 0) {
        try {
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(inputElement);
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand('delete');
          console.log('[Perplexity] Cleared all text');
        } catch (err) {
          console.error('[Perplexity] clear failed:', err);
        }
      }
    } else if (text.startsWith(lastText)) {
      // User is typing forward - insert only the new characters
      const newChars = text.slice(lastText.length);
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(inputElement);
        range.collapse(false); // Collapse to end
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertText', false, newChars);
        console.log('[Perplexity] Inserted:', newChars);
      } catch (err) {
        console.error('[Perplexity] insert failed:', err);
      }
    } else if (lastText.startsWith(text)) {
      // User is deleting - remove characters from the end
      const charsToDelete = lastText.length - text.length;
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(inputElement);
        range.collapse(false); // Collapse to end
        sel.removeAllRanges();
        sel.addRange(range);
        for (let i = 0; i < charsToDelete; i++) {
          document.execCommand('delete', false, null);
        }
        console.log('[Perplexity] Deleted', charsToDelete, 'chars');
      } catch (err) {
        console.error('[Perplexity] delete failed:', err);
      }
    } else {
      // Text changed completely (paste, select middle+delete, etc.) - replace all
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(inputElement);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('delete');
        if (text.length > 0) {
          document.execCommand('insertText', false, text);
        }
        console.log('[Perplexity] Replaced all with:', text);
      } catch (err) {
        console.error('[Perplexity] replace failed:', err);
      }
    }
  } else if (inputElement.tagName === 'INPUT') {
    inputElement.value = text;
  }

  lastText = text;
  console.log('[Perplexity] Text injection complete');
}

// Handle submit/send button
function submitMessage() {
  // Always rescan submit button in case DOM changed
  submitElement = findElement(config.perplexity?.submit);

  if (submitElement) {
    submitElement.click();
    // Clear cached reference after click
    submitElement = null;
  } else {
    // Fallback: try Enter key
    if (!inputElement) {
      inputElement = findElement(config.perplexity?.input);
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
  const newChatButton = findElement(config.perplexity?.newChat);
  if (newChatButton) {
    newChatButton.click();
  } else {
    console.warn('[Perplexity] New chat button not found');
  }
});

// Rescan selectors when needed
function rescanSelectors() {
  inputElement = null;
  submitElement = null;
  console.log('[Perplexity] Selectors rescanned');
}

// Expose safe API via contextBridge
contextBridge.exposeInMainWorld('perplexityApi', {
  rescanSelectors,
});

// Periodically rescan selectors if not found
let scanAttempts = 0;
const scanInterval = setInterval(() => {
  if (!inputElement && scanAttempts < 10) {
    inputElement = findElement(config.perplexity?.input);
    scanAttempts++;
  } else if (inputElement) {
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
  button.innerHTML = '<span class="icon-expand">⛶</span><span class="icon-collapse" style="display:none">⬓</span>';
  button.title = 'Expand/Collapse';
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

// Show loading overlay immediately
let loadingOverlay = null;
if (document.body) {
  loadingOverlay = createLoadingOverlay();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    loadingOverlay = createLoadingOverlay();
  });
}

// Hide loading overlay when page is fully loaded
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
