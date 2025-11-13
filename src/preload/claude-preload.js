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
const provider = 'claude';

let inputElement = null;
let lastText = '';
function injectText(text) {
  // Always rescan input element in case user switched chats
  inputElement = findElement(config.claude?.input);

  if (!inputElement) {
    ipcRenderer.invoke('selector-error', 'claude', 'Input element not found');
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
    // Handle contenteditable div - preserve newlines as <br>
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
      key: 'a',
    }),
  ];

  events.forEach((event) => inputElement.dispatchEvent(event));
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
