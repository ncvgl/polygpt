const { ipcRenderer } = require('electron');
const throttle = require('../utils/throttle');

const textInput = document.getElementById('textInput');
const charCount = document.getElementById('charCount');
const errorBanner = document.getElementById('errorBanner');
const errorMessage = document.getElementById('errorMessage');
const retryBtn = document.getElementById('retryBtn');
const refreshBtn = document.getElementById('refreshBtn');

let currentText = '';

// Update character count
function updateCharCount() {
  charCount.textContent = textInput.value.length;
}

// Throttled function to send text updates
const sendTextUpdate = throttle(async (text) => {
  currentText = text;
  await ipcRenderer.invoke('send-text-update', text);
}, 50);

// Handle text input
textInput.addEventListener('input', (event) => {
  updateCharCount();
  sendTextUpdate(event.target.value);
});

// Handle keyboard shortcuts
textInput.addEventListener('keydown', (event) => {
  // Enter to submit, Shift+Enter for new line
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitToLightning();
  }
});

// Submit to both views
function submitToLightning() {
  if (currentText.trim() === '') {
    return; // Don't submit empty text
  }

  // Send submit signal to preload scripts
  ipcRenderer.invoke('submit-message').catch((error) => {
    console.error('Failed to submit:', error);
  });

  // Clear the input after submit
  textInput.value = '';
  currentText = '';
  updateCharCount();
}

// Listen for selector errors from preload scripts
ipcRenderer.on('selector-error', (event, data) => {
  const { source, error } = data;
  errorMessage.textContent = `[${source}] ${error}`;
  errorBanner.style.display = 'flex';

  // Auto-hide after 5 seconds
  setTimeout(() => {
    errorBanner.style.display = 'none';
  }, 5000);
});

// Retry button handler
retryBtn.addEventListener('click', () => {
  // Notify preload scripts to rescan
  // This requires exposing APIs via contextBridge
  ipcRenderer.invoke('rescan-selectors').catch((error) => {
    console.error('Failed to rescan:', error);
  });

  errorBanner.style.display = 'none';
});

// Refresh button handler
refreshBtn.addEventListener('click', () => {
  ipcRenderer.invoke('refresh-pages').catch((error) => {
    console.error('Failed to refresh:', error);
  });
});

// Focus on load
textInput.focus();

// Initialize character count
updateCharCount();
