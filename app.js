// Little To-Do, backed by VibeCodeStorage's browser-storage and transfer modules.
// Opening the page creates nothing. The first save creates one private store for this
// browser profile. "Share link" copies a private transfer link that opens the same list elsewhere.

import { openBrowserStore, browserConnection } from './browser-storage.mjs';
import { transferLink, parseTransfer } from './connection-transfer.mjs';

const OPTIONS = { name: 'little-todo', endpoint: 'https://api.vibecodestorage.com' };
const KEY = 'todos';

// A transfer fragment must never reach a server. Strip it before any I/O.
let incoming = null;
if (location.hash.startsWith('#vcs-connect=')) {
  const fragment = location.hash;
  history.replaceState(null, '', location.pathname + location.search);
  try { incoming = parseTransfer(fragment); } catch { incoming = { invalid: true }; }
}

const $ = id => document.getElementById(id);
const list = $('list'), status = $('status'), input = $('new-todo'), count = $('count');
const connection = browserConnection(OPTIONS);

let store = null;
let todos = [];
let version = 0;
let busy = false;

function setStatus(text, isError = false) {
  status.textContent = text;
  status.className = 'status' + (isError ? ' error' : '');
}

function setBusy(flag) {
  busy = flag;
  for (const el of document.querySelectorAll('#add-form button, #add-form input, footer button')) el.disabled = flag;
  if (!flag) $('share').disabled = !connected();
}

function connected() { try { return connection.saved(); } catch { return false; } }

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
  $('share').disabled = !connected();
}

// openBrowserStore provisions a store on an unconnected browser, so it is only
// reached from a real save or once a connection is already saved.
async function ensureStore() {
  if (!store) store = await openBrowserStore(OPTIONS);
  return store;
}

async function load() {
  setBusy(true);
  setStatus('Loading…');
  try {
    const s = await ensureStore();
    try {
      const entry = await s.getEntry(KEY);
      todos = Array.isArray(entry.value) ? entry.value : [];
      version = entry.version;
    } catch (e) {
      if (e.status !== 404) throw e;
      todos = []; version = 0;
    }
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
    const s = await ensureStore();
    const result = await s.set(KEY, next, { version });
    todos = next;
    version = result.version;
    render();
    setStatus(`Saved (v${version})`);
  } catch (e) {
    if (e.status === 409) {
      setStatus('Another tab saved first. Reloading the latest list…', true);
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
  if (e.status === 429 || e.status === 503) {
    setStatus(`Storage is busy or a pilot limit was hit. Try again later. (${e.message})`, true);
  } else {
    setStatus(e.message, true);
  }
}

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
  try {
    const url = transferLink(location.href, await connection.recovery(), OPTIONS.name);
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Private link copied. Open it on another device to see this list there. Anyone with it can read, edit and delete the list.');
    } catch {
      status.textContent = 'Copy this private link: ';
      const a = document.createElement('a'); a.href = url; a.textContent = 'open shared list'; status.append(a);
      status.className = 'status';
    }
  } catch (e) { explain(e); }
});

async function acceptIncoming(payload) {
  $('incoming').hidden = true;
  setBusy(true);
  setStatus('Connecting to the shared list…');
  try {
    await connection.restore(payload);
    store = null;
    await load();
  } catch (e) {
    explain(e);
    setBusy(false);
    if (connected()) load();
  }
}

render();
if (incoming) {
  if (incoming.invalid || incoming.app !== OPTIONS.name) {
    setStatus('This share link is invalid or belongs to a different app.', true);
    if (connected()) load();
  } else {
    const payload = incoming; incoming = null;
    $('incoming').hidden = false;
    $('incoming-yes').addEventListener('click', () => acceptIncoming(payload));
    $('incoming-no').addEventListener('click', () => { $('incoming').hidden = true; if (connected()) load(); else setStatus('Nothing saved yet. Your first save creates a private list for this browser.'); });
  }
} else if (connected()) {
  load();
} else {
  setStatus('Nothing saved yet. Your first save creates a private list for this browser.');
}
