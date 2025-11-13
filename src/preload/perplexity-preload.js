const { ipcRenderer } = require('electron');
const {
  loadConfig,
  findElement,
  createSubmitHandler,
  setupIPCListeners,
  setupInputScanner,
  createUIControls,
  setupViewInfoListener,
  setupSupersizeListener,
  setupLoadingOverlay,
  waitForDOM,
} = require('./shared-preload-utils');

const config = loadConfig();
const provider = 'perplexity';

let inputElement = null;
let lastText = '';
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

  if (inputElement.tagName === 'TEXTAREA') {
    inputElement.value = text;
    inputElement.selectionStart = text.length;
    inputElement.selectionEnd = text.length;
  } else if (inputElement.contentEditable === 'true') {
    const currentContent = inputElement.textContent || '';

    if (text === lastText && text === currentContent) {
      return;
    } else if (text.length === 0) {
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

const submitMessage = createSubmitHandler(
  provider,
  config,
  () => inputElement,
  null
);

setupIPCListeners(provider, config, injectText, submitMessage, { value: lastText });

setupInputScanner(
  provider,
  config,
  () => inputElement,
  (el) => { inputElement = el; },
  null
);

const getViewInfo = setupViewInfoListener((viewInfo) => {
  window.polygptGetViewInfo = () => viewInfo;
  createUIControls(viewInfo);
});

setupSupersizeListener();

setupLoadingOverlay();

waitForDOM(() => {
  const viewInfo = getViewInfo();
  if (viewInfo) createUIControls(viewInfo);
});
