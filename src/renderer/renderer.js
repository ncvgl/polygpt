const { ipcRenderer } = require('electron');
const throttle = require('../utils/throttle');

const textInput = document.getElementById('textInput');
const charCount = document.getElementById('charCount');
const errorBanner = document.getElementById('errorBanner');
const errorMessage = document.getElementById('errorMessage');
const retryBtn = document.getElementById('retryBtn');
const refreshBtn = document.getElementById('refreshBtn');
const newChatBtn = document.getElementById('newChatBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');

let currentText = '';

function updateCharCount() {
  charCount.textContent = textInput.value.length;
}

const sendTextUpdate = throttle(async (text) => {
  currentText = text;
  await ipcRenderer.invoke('send-text-update', text);
}, 50);

textInput.addEventListener('input', (event) => {
  updateCharCount();
  sendTextUpdate(event.target.value);
});

textInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitMessage();
  }
});

function submitMessage() {
  if (currentText.trim() === '') {
    return;
  }

  ipcRenderer.invoke('submit-message').catch((error) => {
    console.error('Failed to submit:', error);
  });

  textInput.value = '';
  currentText = '';
  updateCharCount();
}

ipcRenderer.on('selector-error', (event, data) => {
  const { source, error } = data;
  errorMessage.textContent = `[${source}] ${error}`;
  errorBanner.style.display = 'flex';

  setTimeout(() => {
    errorBanner.style.display = 'none';
  }, 5000);
});

retryBtn.addEventListener('click', () => {
  ipcRenderer.invoke('rescan-selectors').catch((error) => {
    console.error('Failed to rescan:', error);
  });

  errorBanner.style.display = 'none';
});

refreshBtn.addEventListener('click', () => {
  ipcRenderer.invoke('refresh-pages').catch((error) => {
    console.error('Failed to refresh:', error);
  });
});

newChatBtn.addEventListener('click', () => {
  ipcRenderer.invoke('new-chat').catch((error) => {
    console.error('Failed to start new chat:', error);
  });

  textInput.value = '';
  currentText = '';
  updateCharCount();
});

zoomInBtn.addEventListener('click', () => {
  ipcRenderer.invoke('zoom-in').catch((error) => {
    console.error('Failed to zoom in:', error);
  });
});

zoomOutBtn.addEventListener('click', () => {
  ipcRenderer.invoke('zoom-out').catch((error) => {
    console.error('Failed to zoom out:', error);
  });
});

textInput.focus();

updateCharCount();
