const { ipcRenderer } = require('electron');

// Inline selectors — no separate config file needed
const SELECTORS = {
  chatgpt: {
    input: ['#prompt-textarea', "textarea[placeholder*='Message']", "div[contenteditable='true']"],
    submit: ["button[data-testid='send-button']", "button[aria-label*='Send']", "button[type='submit']"],
    newChat: ["a[href='/']", "button[aria-label*='New chat']"],
  },
  gemini: {
    input: ['rich-textarea', "div[role='textbox']", "[contenteditable='true']", 'textarea'],
    submit: ["button[aria-label*='Send']", "button[data-testid='send-button']"],
    newChat: ["button[aria-label*='New chat']", "a[aria-label*='New chat']"],
  },
  perplexity: {
    input: ['#ask-input', "div[data-lexical-editor='true']", "[contenteditable='true'][role='textbox']", "[contenteditable='true']"],
    submit: ["button[data-testid='submit-button']", "button[aria-label='Submit']", "button[type='submit']"],
    newChat: ["button[aria-label*='New']", "a[aria-label*='New']"],
  },
  claude: {
    input: ["div[data-testid='chat-input']", "div[contenteditable='true'][role='textbox']", 'div.ProseMirror', "[role='textbox']"],
    submit: ["button[aria-label='Send message']", "button[aria-label*='Send']", "button[type='submit']"],
    newChat: ["button[aria-label*='New']", "a[aria-label*='New']"],
  },
};

let provider = null, position = null, lastText = '';

function q(selectors) {
  for (const s of selectors) { try { const el = document.querySelector(s); if (el) return el; } catch(e) {} }
  return null;
}

// Gemini wraps its input in a rich-textarea shadow-like structure
function resolveInput(el) {
  if (!el) return null;
  if (provider === 'gemini') {
    if (el.tagName === 'RICH-TEXTAREA') { const c = el.querySelector("[contenteditable='true']"); if (c) return c; }
    if (el.contentEditable === 'true') return el.querySelector('p') || el;
  }
  return el;
}

function getInput() { return resolveInput(q(SELECTORS[provider]?.input)); }

function injectText(text) {
  const el = getInput();
  if (!el) return;

  if (provider === 'perplexity' && el.contentEditable === 'true') {
    // Perplexity needs execCommand to trigger its Lexical editor
    el.focus();
    const sel = window.getSelection(), range = document.createRange();
    range.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(range);
    document.execCommand('delete');
    if (text) document.execCommand('insertText', false, text);
  } else if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    el.value = text;
    el.selectionStart = el.selectionEnd = text.length;
  } else if (el.contentEditable === 'true') {
    while (el.firstChild) el.removeChild(el.firstChild);
    text.split('\n').forEach((line, i, arr) => {
      el.appendChild(document.createTextNode(line));
      if (i < arr.length - 1) el.appendChild(document.createElement('br'));
    });
  }

  lastText = text;
  [new Event('input', { bubbles: true }), new Event('change', { bubbles: true }),
   new KeyboardEvent('keyup', { bubbles: true, key: 'a' })].forEach(e => el.dispatchEvent(e));
}

function submit() {
  const btn = q(SELECTORS[provider]?.submit);
  if (btn) { btn.click(); return; }
  const el = getInput();
  if (el) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
}

// --- UI overlay (provider dropdown + supersize button) ---
const CSS = `
#pgpt-ctl { position:fixed; top:10px; right:10px; display:flex; gap:8px; z-index:9999999; font:14px -apple-system,sans-serif; }
#pgpt-ctl button, #pgpt-ctl .dd-sel { border:none; border-radius:6px; background:rgba(0,0,0,.5); color:#fff; height:36px; cursor:pointer; backdrop-filter:blur(4px); padding:0 12px; }
#pgpt-ctl button:hover, #pgpt-ctl .dd-sel:hover { background:rgba(0,0,0,.7); }
#pgpt-ctl .dd { position:relative; }
#pgpt-ctl .dd-menu { display:none; position:absolute; top:40px; left:0; width:100%; background:rgba(0,0,0,.9); border-radius:6px; overflow:hidden; backdrop-filter:blur(4px); }
#pgpt-ctl .dd:hover .dd-menu { display:block; }
#pgpt-ctl .dd-opt { padding:10px 12px; color:#fff; cursor:pointer; }
#pgpt-ctl .dd-opt:hover { background:rgba(255,255,255,.2); }
`;

function createControls(info) {
  const old = document.getElementById('pgpt-ctl'); if (old) old.remove();
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  const ctl = document.createElement('div'); ctl.id = 'pgpt-ctl';

  // Dropdown
  const dd = document.createElement('div'); dd.className = 'dd';
  const sel = document.createElement('div'); sel.className = 'dd-sel';
  sel.textContent = info.providers.find(p => p.key === provider)?.name || '';
  const menu = document.createElement('div'); menu.className = 'dd-menu';
  info.providers.forEach(p => {
    const opt = document.createElement('div'); opt.className = 'dd-opt'; opt.textContent = p.name;
    opt.onclick = () => ipcRenderer.invoke('change-provider', position, p.key);
    menu.appendChild(opt);
  });
  dd.appendChild(sel); dd.appendChild(menu); ctl.appendChild(dd);

  // Supersize button
  const btn = document.createElement('button'); btn.id = 'pgpt-ss';
  btn.textContent = '\u26F6'; btn.title = 'Supersize';
  btn.onclick = () => ipcRenderer.invoke('toggle-supersize', position);
  ctl.appendChild(btn);

  document.body.appendChild(ctl);
}

// --- IPC listeners ---
ipcRenderer.on('view-info', (_, info) => {
  provider = info.provider;
  position = info.position;
  if (document.body) createControls(info);
});

ipcRenderer.on('text-update', (_, text) => { if (text !== lastText) injectText(text); });
ipcRenderer.on('submit', () => submit());
ipcRenderer.on('new-chat', () => { const btn = q(SELECTORS[provider]?.newChat); if (btn) btn.click(); });
ipcRenderer.on('supersize-state', (_, ss) => {
  const btn = document.getElementById('pgpt-ss');
  if (btn) btn.textContent = ss === position ? '\u25F1' : '\u26F6';
});

// Scan for input element on load
let scans = 0;
const scanner = setInterval(() => { if (getInput() || ++scans >= 10) clearInterval(scanner); }, 500);
