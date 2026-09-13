// The Postman collection documents most host/gift/call fields only in prose
// ("bio, talksAboutTags/hobbies/sports/languages, gallery, rating, followerCount,
// isFollowing, online status, derived age…") rather than an exact JSON schema.
// These helpers normalize a handful of plausible key spellings so the UI keeps
// working regardless of which one the live backend actually returns.

export function normalizeHost(h) {
  if (!h) return h
  return {
    id: h.id || h.hostId,
    name: h.name || h.displayName || h.username || 'Host',
    bio: h.bio || '',
    ratePaise: h.ratePerMinutePaise ?? h.ratePaise ?? (h.rate != null ? h.rate * 100 : 0),
    rating: h.rating ?? h.avgRating ?? 0,
    followerCount: h.followerCount ?? h.followers ?? 0,
    galleryCount: h.galleryCount ?? h.photoCount ?? (Array.isArray(h.gallery) ? h.gallery.length : 0),
    gallery: h.gallery || [],
    languages: h.languages || h.langs || [],
    talksAboutTags: h.talksAboutTags || h.talksAbout || [],
    hobbies: h.hobbies || [],
    sports: h.sports || [],
    online: h.online ?? h.isOnline ?? false,
    live: h.live ?? h.isLive ?? false,
    verified: h.verified ?? h.isVerified ?? false,
    age: h.age ?? h.derivedAge ?? null,
    isFollowing: h.isFollowing ?? false,
    category: h.category || (h.talksAboutTags && h.talksAboutTags[0]) || (h.talksAbout && h.talksAbout[0]) || '',
  }
}

export function normalizeHostList(res) {
  const list = res?.hosts || res?.items || res?.results || (Array.isArray(res) ? res : [])
  return list.map(normalizeHost)
}

export function normalizeGift(g) {
  if (!g) return g
  return { id: g.id, name: g.name, emoji: g.emoji || '🎁', price: g.priceBeans ?? g.price ?? 0 }
}
