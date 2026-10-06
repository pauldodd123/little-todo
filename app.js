import { Store } from './vcs.js';
import { credentials } from './config.js';

const KEY = 'todos';
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
  for (const el of document.querySelectorAll('button, input')) el.disabled = flag;
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
    setStatus(`The storage API refused this page's origin (${location.origin}). ` +
      'VibeCodeStorage does not allow browser origins by default, so this origin must be allowlisted on the service. ' +
      `(${e.message})`, true);
  } else if (e.status === 401 || e.status === 403) {
    setStatus(`Storage rejected the credentials: ${e.message}`, true);
  } else if (e.status === 429 || e.status === 503) {
    setStatus(`Storage is busy or a pilot limit was hit. Try again shortly. (${e.message})`, true);
  } else {
    setStatus(`Storage error: ${e.message}`, true);
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

try {
  store = new Store(credentials);
  load();
} catch (e) {
  setStatus(`Bad config: ${e.message}`, true);
}
