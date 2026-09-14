// Verified against the live backend (https://triloapp-plan.onrender.com) — these
// are the real field names, not guesses. A couple of small defensive fallbacks
// are kept (e.g. `h.id || h.hostId`) only where a value can plausibly arrive
// nested under a different key depending on the endpoint (list vs. detail vs.
// embedded in another resource like a live broadcast).

export function normalizeHost(h) {
  if (!h) return h
  return {
    id: h.id || h.hostId,
    name: h.name || 'Host',
    bio: h.bio || '',
    ratePaise: h.ratePerMinutePaise ?? 0,
    rating: h.rating?.average ?? 0,
    ratingCount: h.rating?.count ?? 0,
    followerCount: h.followerCount ?? 0,
    galleryCount: h.galleryCount ?? (Array.isArray(h.gallery) ? h.gallery.length : 0),
    gallery: h.gallery || [],
    languages: h.languages || [],
    talksAboutTags: h.talksAboutTags || [],
    hobbies: h.hobbies || [],
    sports: h.sports || [],
    online: h.isOnline ?? false,
    // Neither "live" nor "verified" nor "category" exist on the host resource —
    // live status only exists per-broadcast (GET /live/broadcasts), and there's
    // no verification/category concept in this API. Left false/empty rather
    // than invented.
    live: false,
    verified: false,
    age: h.age ?? null,
    isFollowing: h.isFollowing ?? false,
    category: (h.talksAboutTags && h.talksAboutTags[0]) || '',
  }
}

export function normalizeHostList(res) {
  const list = res?.hosts || res?.items || res?.results || (Array.isArray(res) ? res : [])
  return list.map(normalizeHost)
}

export function normalizeGift(g) {
  if (!g) return g
  // Gifts are priced in real paise (pricePaise), NOT the wallet's cosmetic
  // "beans" label — displayBeans only ever appears on wallet/recharge/call-spend
  // responses, never on the gift catalog itself.
  return { id: g.id, name: g.name, iconUrl: g.iconUrl || null, pricePaise: g.pricePaise ?? 0 }
}
