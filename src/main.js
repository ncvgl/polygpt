const { app, BaseWindow, WebContentsView, Menu, clipboard, ipcMain, session } = require('electron');
const path = require('path');

const PROVIDERS = {
  chatgpt:    { url: 'https://chat.openai.com',  name: 'ChatGPT' },
  claude:     { url: 'https://claude.ai',         name: 'Claude' },
  perplexity: { url: 'https://www.perplexity.ai', name: 'Perplexity', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
  gemini:     { url: 'https://gemini.google.com',  name: 'Gemini' },
};

const POSITIONS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
const preloadPath = path.join(__dirname, 'preload.js');
let win, views = {}, mainView, supersized = null, zoom = 1.0;
const layout = { topLeft: 'claude', topRight: 'perplexity', bottomLeft: 'chatgpt', bottomRight: 'gemini' };

function makeView(providerKey, position) {
  const p = PROVIDERS[providerKey];
  const view = new WebContentsView({
    webPreferences: { partition: 'persist:shared', preload: preloadPath, nodeIntegration: false, contextIsolation: true, sandbox: false },
  });
  if (p.ua) view.webContents.setUserAgent(p.ua);

  view.webContents.on('context-menu', (_, params) => {
    const t = [];
    if (params.selectionText) t.push({ label: 'Copy', click: () => clipboard.writeText(params.selectionText) });
    if (params.isEditable) { if (t.length) t.push({ type: 'separator' }); t.push({ label: 'Paste', role: 'paste' }); }
    if (t.length) Menu.buildFromTemplate(t).popup();
  });

  view.webContents.on('did-finish-load', () => {
    view.webContents.setZoomFactor(zoom);
    view.webContents.send('view-info', { position, provider: providerKey, providers: Object.entries(PROVIDERS).map(([k, v]) => ({ key: k, name: v.name })) });
    if (supersized) view.webContents.send('supersize-state', supersized);
  });

  view.webContents.loadURL(p.url);
  return view;
}

function updateBounds() {
  const { width, height } = win.getContentBounds();
  const barH = 100, chatH = height - barH;

  if (!supersized) {
    const hw = Math.floor(width / 2), hh = Math.floor(chatH / 2);
    views.topLeft.setBounds({ x: 0, y: 0, width: hw, height: hh });
    views.topRight.setBounds({ x: hw + 1, y: 0, width: width - hw - 1, height: hh });
    views.bottomLeft.setBounds({ x: 0, y: hh + 1, width: hw, height: chatH - hh - 1 });
    views.bottomRight.setBounds({ x: hw + 1, y: hh + 1, width: width - hw - 1, height: chatH - hh - 1 });
  } else {
    const mw = Math.floor(width * 0.8), tw = width - mw - 2, th = Math.floor(chatH / 3);
    views[supersized].setBounds({ x: 0, y: 0, width: mw, height: chatH });
    POSITIONS.filter(p => p !== supersized).forEach((p, i) => {
      views[p].setBounds({ x: mw + 2, y: i * (th + 1), width: tw, height: th });
    });
  }
  mainView.setBounds({ x: 0, y: chatH, width, height: barH });
}

function sendToViews(channel, ...args) {
  const targets = supersized ? [supersized] : POSITIONS;
  targets.forEach(p => views[p]?.webContents?.send(channel, ...args));
}

app.on('ready', () => {
  session.fromPartition('persist:shared').setPermissionRequestHandler((_, perm, cb) => cb(perm === 'media'));
  session.fromPartition('persist:shared').setPermissionCheckHandler((_, perm) => perm === 'media');

  win = new BaseWindow({ width: 1600, height: 900, show: false, backgroundColor: '#e0e0e0' });
  win.maximize();

  mainView = new WebContentsView({ webPreferences: { nodeIntegration: true, contextIsolation: false } });
  POSITIONS.forEach(pos => { views[pos] = makeView(layout[pos], pos); win.contentView.addChildView(views[pos]); });
  win.contentView.addChildView(mainView);
  mainView.webContents.loadFile(path.join(__dirname, 'renderer.html'));

  win.on('resized', updateBounds);
  setTimeout(updateBounds, 100);
  win.show();

  ipcMain.handle('text-update', (_, text) => sendToViews('text-update', text));
  ipcMain.handle('submit', () => sendToViews('submit'));
  ipcMain.handle('new-chat', () => sendToViews('new-chat'));
  ipcMain.handle('zoom', (_, dir) => {
    zoom = Math.min(2, Math.max(0.5, zoom + dir * 0.1));
    POSITIONS.forEach(p => views[p].webContents.setZoomFactor(zoom));
  });
  ipcMain.handle('toggle-supersize', (_, pos) => {
    supersized = supersized === pos ? null : pos;
    updateBounds();
    POSITIONS.forEach(p => views[p].webContents.send('supersize-state', supersized));
    return supersized;
  });
  ipcMain.handle('change-provider', (_, pos, key) => {
    win.contentView.removeChildView(views[pos]);
    views[pos].webContents.close();
    views[pos] = makeView(key, pos);
    win.contentView.addChildView(views[pos]);
    layout[pos] = key;
    updateBounds();
  });
  ipcMain.handle('refresh', () => POSITIONS.forEach(p => views[p].webContents.reload()));
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
