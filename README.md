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

The app talks to the deployed backend at `https://triloapp-plan.onrender.com` by
default (set in `.env`). It's a Render free-tier instance, so the first request
after a period of inactivity can take 30–60s to cold-start. Point the app at a
different backend (e.g. a local instance from the Postman collection) by editing
`.env` or setting `VITE_API_BASE_URL` in your shell before running `npm run dev`.

## Backend integration

All data — auth, profile, hosts, wallet, calls, chat, gifts, live broadcasts,
moderation, grievances — comes from the real API via `src/lib/api.js`, which
mirrors every request in the Postman collection (base URL, auth headers, one
silent access-token refresh on a 401). `src/lib/normalize.js` normalizes the
handful of fields (host `rating`, gift pricing, etc.) that differ from what the
Postman collection describes in prose — verified directly against the live
`https://triloapp-plan.onrender.com` backend, not guessed.

**Calls are not real media yet.** `POST /calls` returns a real Agora
`channelName` + `agoraToken` for RTC signaling, but `CallRoom.jsx` doesn't join
Agora at all — it fakes the "connected" UI state locally after ~2s and never
actually opens audio/video. That means the backend's own call/billing state
machine never sees the call as truly connected (it just sits in `ringing`), so
`Calls` won't function end-to-end until the Agora Web SDK is wired in.

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
