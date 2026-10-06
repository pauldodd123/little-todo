# Little To-Do

A tiny static to-do list that keeps its data in an encrypted
[VibeCodeStorage](https://vibecodestorage.com) store, using the
[Connect component](https://vibecodestorage.com/connect.html). No framework,
no build step, no login. Live at https://pauldodd123.github.io/little-todo/

- `index.html`, `style.css`, `app.js`: the UI. `app.js` only reads and writes
  the list; it never sees credentials directly.
- `vcs-connect.mjs`, `browser-storage.mjs`, `connection-transfer.mjs`,
  `client/`: the Connect component and SDK, copied unchanged from
  `vcs-connect.zip` (MIT).

## How it works

Opening the page creates nothing. The first save calls `getStore()` on the
component, which provisions one private pilot store for this browser profile
and keeps its credentials in localStorage. Reloads reuse that store. The
component's "Connection & recovery" panel can save a recovery file, restore
one, or copy a private transfer link to connect another device. The app
listens for `vcs-connected` and reloads the list after a restore or transfer.

Each browser profile is its own list. Anyone with the recovery file or
transfer link can read, edit or delete that list, so use test data only.

## Data model

The whole list lives in one row (`todos`). Writes use optimistic versioning,
so if two tabs save at once the loser reloads instead of overwriting.
