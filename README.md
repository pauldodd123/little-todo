# Little To-Do

A tiny static to-do list that keeps its data in an encrypted
[VibeCodeStorage](https://vibecodestorage.com) store, built on the storage and
transfer modules from the [Connect component](https://vibecodestorage.com/connect.html)
package. No framework, no build step, no login.
Live at https://pauldodd123.github.io/little-todo/

- `index.html`, `style.css`, `app.js`: the UI.
- `browser-storage.mjs`, `connection-transfer.mjs`, `client/`: store
  provisioning, connection storage, transfer links and the SDK, copied
  unchanged from `vcs-connect.zip` (MIT). The package's `<vcs-connect>` panel
  is not used; the app has its own single Share link button instead.

## How it works

Opening the page creates nothing. The first save provisions one private pilot
store for this browser profile and keeps its credentials in localStorage.
Reloads reuse that store. "Share link" copies a private transfer link; opening
it on another device asks for confirmation, then connects that browser to the
same list. The link never leaves the URL fragment, and a browser that already
has a different list keeps it rather than replacing it.

Each browser profile is its own list. Anyone with the recovery file or
transfer link can read, edit or delete that list, so use test data only.

## Data model

The whole list lives in one row (`todos`). Writes use optimistic versioning,
so if two tabs save at once the loser reloads instead of overwriting.
