# Little To-Do

A tiny static to-do list that keeps its data in an encrypted
[VibeCodeStorage](https://vibecodestorage.com) store. No framework, no build
step, no login. Live at https://pauldodd123.github.io/little-todo/

- `index.html`, `style.css`, `app.js`: the UI.
- `vcs.js`: a small browser client speaking the VibeCodeStorage wire format
  (HKDF-derived keys, AES-256-GCM envelopes, HMAC row ids, If-Match versions).

## Connecting

No credentials are committed. On first visit the page asks for the store
credentials as JSON (`endpoint`, `storeId`, `accessToken`, `encryptionKey`)
and keeps them in that browser's localStorage. "Share link" copies a URL with
the credentials in the hash so the same list opens on another device; the
hash never reaches a server. Anyone with the credentials can read, edit or
delete the list, so use test data only.

Store creation is blocked for browser origins by the API, so make the store
once from Node with the official SDK and paste its credentials in. Reads and
writes to an existing store are allowed from any origin.

## Data model

The whole list lives in one row (`todos`). Writes use optimistic versioning,
so if two tabs save at once the loser reloads instead of overwriting.
