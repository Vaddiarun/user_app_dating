# Vibe — Web App (React + Tailwind CSS)

A **desktop web app** for a creator video-call / chat / live platform. Single-page
React app with a sidebar shell, client-side routing, and a global auth/profile
store — backed by the real TriloPlan User API (see
`TriloPlan-User.postman_collection.json` for the full endpoint reference).

## Run

```bash
npm install
npm run dev       # http://localhost:5173
npm run build && npm run preview
```

The app expects the backend from the Postman collection at `http://localhost:4000`
by default. Point it elsewhere with a `.env` file:

```
VITE_API_BASE_URL=http://localhost:4000
```

## Backend integration

All data — auth, profile, hosts, wallet, calls, chat, gifts, live broadcasts,
moderation, grievances — comes from the real API via `src/lib/api.js`, which
mirrors every request in the Postman collection (base URL, auth headers, one
silent access-token refresh on a 401). `src/lib/normalize.js` defensively
normalizes a couple of plausible field-name variants for hosts/gifts, since the
collection documents most host fields in prose rather than an exact schema.

A few screens have no backing endpoint in the collection and are called out in
the UI rather than faked:
- **Level Up / loyalty tiers** — explicitly out of scope per the collection notes.
- **Transaction history** — there's a recharge-by-id endpoint but no "list all
  recharges" endpoint, so Settings → Talktime Transactions is intentionally empty.
- **Live viewer counts / chat feed** — join/chat/leave endpoints exist but there's
  no polling/websocket endpoint to read them back, so the live chat feed only
  shows messages you sent this session.
- **Do Not Disturb** — no endpoint in the collection; the toggle was removed.

OTP login uses the backend's dev-only bypass (any phone + any 6-digit code)
described in the collection — there's no real SMS provider wired up.

## Structure

```
src/
  main.jsx                  BrowserRouter + AppProvider + theme init
  App.jsx                   route table + auth guards (RequireAuth/RequireGuest)
  lib/
    api.js                  API client — every endpoint in the Postman collection
    normalize.js             defensive field-name normalization for hosts/gifts
    format.js                beans(), clock(), relTime(), rupees() …
  store/
    seed.js                 avatar gradient palette (cosmetic only)
    AppStore.jsx            auth session + profile/wallet/notifPrefs/blocked state
  components/
    AppShell.jsx            sidebar + topbar + responsive bottom nav
    ui.jsx                  Button, Card, Modal, Chip, Segmented, Toggle,
                            EmptyState, Avatar, GradientBox, ToastHost …
    GiftPicker.jsx
  pages/
    Home, Creator, Search, Chat, Calls, CallRoom, Live (+LiveRoom),
    Wallet (+AddBalance), Notifications, Profile, Settings (all sub-pages),
    Outcomes (call-ended / summary / gift-sent / block / report),
    Auth (onboarding), Errors (404 / offline / session / restricted / logout)
```

## Routes

`/` Home · `/live` · `/live/:id` live room · `/chat` `/chat/:id` · `/calls` ·
`/call/:id?mode=video|voice` active call · `/wallet` `/add-balance` ·
`/notifications` · `/creator/:id` · `/search` · `/profile` + `/settings/*` ·
`/vip` · `/onboarding/*` · error pages.

Guests are redirected to `/onboarding`; everything else requires a valid
session (checked against `GET /me` on boot).

Responsive: full sidebar ≥ 1024px, top bar + bottom tab bar below. Light/dark
theme (toggle at the bottom of the sidebar), follows system by default.
Photos/videos are gradient placeholders.
