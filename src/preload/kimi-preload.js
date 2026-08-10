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
const provider = 'kimi';

// Kimi's composer is a Lexical editor (div.chat-input-editor[data-lexical-editor]).
// Lexical keeps its own selection model and reconciles asynchronously, which rules
// out every technique the other providers use. What was measured against the live
// site:
//   - programmatic DOM Ranges never reach Lexical, so selection-based edits no-op
//   - a burst of synchronous edits in one tick all act on the same stale state,
//     so N sequential deletes remove exactly one character
//   - insertText silently truncates at the first newline
//   - execCommand('insertLineBreak') wipes the whole editor
// What does work is a single atomic operation per call: execCommand('selectAll'),
// yield a tick so Lexical syncs its selection from the DOM, then either paste the
// full text (replaces the selection, newlines intact) or send Backspace to clear.
// Because that needs to await, injectText is async and coalesces latest-wins.
const SELECTION_SYNC_MS = 20;

let inputElement = null;

function findKimiInput(element) {
  if (!element) return null;
  if (element.isContentEditable || element.tagName === 'TEXTAREA') return element;
  const inner = element.querySelector('[contenteditable="true"], textarea');
  return inner || element;
}

// Read the editor back the way the control bar spells it: <br> and block
// boundaries become newlines. Trailing newlines are dropped because Lexical's
// empty state is <p><br></p>, which would otherwise read as "\n".
function readEditor(element) {
  if (!element) return '';
  if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') return element.value;
  const BLOCK = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE']);
  let out = '';
  (function walk(node) {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.nodeValue;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === 'BR') {
          out += '\n';
          continue;
        }
        const isBlock = BLOCK.has(child.tagName) || getComputedStyle(child).display.startsWith('block');
        if (isBlock && out && !out.endsWith('\n')) out += '\n';
        walk(child);
      }
    }
  })(element);
  return normalize(out);
}

function normalize(text) {
  return String(text == null ? '' : text)
    .replace(/[\u200b\ufeff]/g, '')  // Lexical placeholder zero-width chars
    .replace(/\u00a0/g, ' ')         // contenteditable turns space runs into nbsp
    .replace(/\r\n?/g, '\n')
    .replace(/\n+$/, '');
}

function pasteInto(element, text) {
  const data = new DataTransfer();
  data.setData('text/plain', text);
  element.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: data,
    bubbles: true,
    cancelable: true,
  }));
}

function pressBackspace(element) {
  const options = {
    key: 'Backspace',
    code: 'Backspace',
    keyCode: 8,
    which: 8,
    bubbles: true,
    cancelable: true,
    composed: true,
  };
  element.dispatchEvent(new KeyboardEvent('keydown', options));
  element.dispatchEvent(new KeyboardEvent('keyup', options));
}

async function writeText(text) {
  inputElement = findKimiInput(findElement(config.kimi?.input));

  if (!inputElement) {
    ipcRenderer.invoke('selector-error', 'kimi', 'Input element not found');
    return;
  }

  const wanted = normalize(text);
  if (readEditor(inputElement) === wanted) return;

  inputElement.focus();
  document.execCommand('selectAll');
  await new Promise((resolve) => setTimeout(resolve, SELECTION_SYNC_MS));

  if (wanted.length === 0) {
    pressBackspace(inputElement);
  } else {
    pasteInto(inputElement, wanted);
  }
}

// Keystrokes arrive faster than a write completes, so keep only the newest and
// replay it once the in-flight write settles.
let pendingText = null;
let hasPending = false;
let writing = false;

function injectText(text) {
  pendingText = text;
  hasPending = true;
  if (writing) return;
  writing = true;
  (async () => {
    try {
      while (hasPending) {
        const next = pendingText;
        hasPending = false;
        await writeText(next);
      }
    } finally {
      writing = false;
    }
  })();
}

const submitMessage = createSubmitHandler(
  provider,
  config,
  () => inputElement,
  null
);

setupIPCListeners(provider, config, injectText, submitMessage);

setupInputScanner(
  provider,
  config,
  () => inputElement,
  (el) => { inputElement = el; },
  (selectors) => findKimiInput(findElement(selectors))
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
