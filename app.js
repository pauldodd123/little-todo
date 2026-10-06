import { Store } from './vcs.js';

const KEY = 'todos';
const LS_KEY = 'little-todo.credentials';
const FIELDS = ['endpoint', 'storeId', 'accessToken', 'encryptionKey'];
const $ = id => document.getElementById(id);
const list = $('list'), status = $('status'), input = $('new-todo'), count = $('count');

let store;
let todos = [];
let version = 0;
let busy = false;

function setStatus(text, isError = false) {
  status.textContent = text;
  status.className = 'status' + (isError ? ' error' : '');
}

function setBusy(flag) {
  busy = flag;
  for (const el of document.querySelectorAll('#app button, #app input')) el.disabled = flag;
}

// Credentials come from (in order): the URL hash (#storeId=…&accessToken=…&encryptionKey=…),
// localStorage, or the connect form. The hash is scrubbed from the address bar once read.
function loadCredentials() {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('storeId')) {
    const c = { endpoint: hash.get('endpoint') || 'https://api.vibecodestorage.com' };
    for (const f of FIELDS.slice(1)) c[f] = hash.get(f) || '';
    saveCredentials(c);
    history.replaceState(null, '', location.pathname + location.search);
    return c;
  }
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch {}
  return null;
}

function saveCredentials(c) { try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch {} }

function validate(c) {
  if (!c || typeof c !== 'object') throw new Error('Credentials must be a JSON object.');
  c.endpoint ||= 'https://api.vibecodestorage.com';
  for (const f of FIELDS) if (typeof c[f] !== 'string' || !c[f]) throw new Error(`Missing ${f}.`);
  return c;
}

function showConnect(message) {
  $('connect').hidden = false;
  $('app').hidden = true;
  setStatus(message || '');
}

function render() {
  list.innerHTML = '';
  if (!todos.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nothing to do. Add something above.';
    list.append(li);
  }
  for (const t of todos) {
    const li = document.createElement('li');
    li.className = t.done ? 'done' : '';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = t.done;
    cb.addEventListener('change', () => mutate(ts => ts.map(x => x.id === t.id ? { ...x, done: cb.checked } : x)));
    const span = document.createElement('span');
    span.textContent = t.text;
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'del'; del.textContent = '×'; del.title = 'Delete';
    del.addEventListener('click', () => mutate(ts => ts.filter(x => x.id !== t.id)));
    li.append(cb, span, del);
    list.append(li);
  }
  const open = todos.filter(t => !t.done).length;
  count.textContent = todos.length ? `${open} of ${todos.length} left` : '';
  $('clear-done').hidden = !todos.some(t => t.done);
}

async function load() {
  setBusy(true);
  setStatus('Loading…');
  try {
    const entry = await store.getEntry(KEY);
    todos = Array.isArray(entry.value) ? entry.value : [];
    version = entry.version;
    render();
    setStatus(`Synced (v${version})`);
  } catch (e) {
    render();
    explain(e);
  } finally { setBusy(false); }
}

async function mutate(fn) {
  if (busy) return;
  const next = fn(todos);
  setBusy(true);
  setStatus('Saving…');
  try {
    const result = await store.set(KEY, next, version);
    todos = next;
    version = result.version;
    render();
    setStatus(`Saved (v${version})`);
  } catch (e) {
    if (e.status === 409) {
      setStatus('Someone else saved first. Reloading the latest list…', true);
      setBusy(false);
      await load();
      return;
    }
    render();
    explain(e);
  } finally { setBusy(false); }
}

function explain(e) {
  console.error(e);
  if (e.code === 'NETWORK' || e.code === 'ORIGIN_DENIED') {
    setStatus(`Could not reach the storage API from ${location.origin}. (${e.message})`, true);
  } else if (e.status === 401 || e.status === 403 || e.status === 404) {
    setStatus(`Storage rejected the credentials: ${e.message}. Disconnect and try again.`, true);
  } else if (e.status === 429 || e.status === 503) {
    setStatus(`Storage is busy or a pilot limit was hit. Try again shortly. (${e.message})`, true);
  } else {
    setStatus(`Storage error: ${e.message}`, true);
  }
}

function connect(c) {
  try {
    store = new Store(validate(c));
  } catch (e) {
    showConnect(`Bad credentials: ${e.message}`);
    status.className = 'status error';
    return;
  }
  saveCredentials(c);
  $('connect').hidden = true;
  $('app').hidden = false;
  load();
}

$('connect-form').addEventListener('submit', ev => {
  ev.preventDefault();
  let parsed;
  try { parsed = JSON.parse($('creds').value); }
  catch { showConnect('That is not valid JSON.'); status.className = 'status error'; return; }
  $('creds').value = '';
  connect(parsed);
});
$('add-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  mutate(ts => [...ts, { id: crypto.randomUUID(), text, done: false, created: Date.now() }]);
});
$('clear-done').addEventListener('click', () => mutate(ts => ts.filter(t => !t.done)));
$('refresh').addEventListener('click', load);
$('share').addEventListener('click', async () => {
  const c = JSON.parse(localStorage.getItem(LS_KEY));
  const url = location.origin + location.pathname + '#' + new URLSearchParams(c).toString();
  try { await navigator.clipboard.writeText(url); setStatus('Share link copied. Anyone with it can read and edit this list.'); }
  catch { prompt('Copy this link:', url); }
});
$('disconnect').addEventListener('click', () => {
  try { localStorage.removeItem(LS_KEY); } catch {}
  todos = []; version = 0; store = null;
  showConnect('Disconnected.');
});

const saved = loadCredentials();
if (saved) connect(saved); else showConnect();
