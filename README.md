# Little To-Do

A tiny static to-do list that keeps its data in an encrypted
[VibeCodeStorage](https://vibecodestorage.com) store. No framework, no build
step, no login: one shared list for everyone who opens the page.

- `index.html`, `style.css`, `app.js`: the UI.
- `vcs.js`: a small browser client speaking the VibeCodeStorage wire format
  (HKDF-derived keys, AES-256-GCM envelopes, HMAC row ids, If-Match versions).
- `config.js`: the store credentials. This is a throwaway pilot store for test
  data only; anyone with this file can read or delete the list.

The whole list lives in one row (`todos`). Writes use optimistic versioning,
so if two tabs save at once the loser reloads instead of overwriting.

Note: the VibeCodeStorage API rejects browser origins unless they are
allowlisted on the service side, so the page needs its origin enabled before
it can read or write.
