import { useEffect, useState } from 'react'
import { hostsApi } from './api'

// Shared across every page that shows a host's photos, so switching between
// Home / Creator / Chat doesn't re-fetch the same host's gallery each time.
const galleryCache = new Map()

/** Photo-only items from a host's gallery (videos filtered out), or null while loading/unset. */
export function useHostGallery(hostId) {
  const [photos, setPhotos] = useState(() => (hostId ? galleryCache.get(hostId) ?? null : null))
  useEffect(() => {
    if (!hostId) { setPhotos(null); return }
    if (galleryCache.has(hostId)) {
      setPhotos(galleryCache.get(hostId))
      return
    }
    let alive = true
    hostsApi.gallery(hostId)
      .then((res) => {
        const items = (res.items || []).filter((it) => it.mediaType === 'photo' && it.url)
        galleryCache.set(hostId, items)
        if (alive) setPhotos(items)
      })
      .catch(() => {
        if (alive) setPhotos([])
      })
    return () => { alive = false }
  }, [hostId])
  return photos
}

/** The host's profile picture: their explicit avatarUrl if set, otherwise the
 * first photo in their gallery (fetched lazily only when avatarUrl is missing). */
export function useHostAvatarUrl(host) {
  const needsGallery = !!host?.id && !host?.avatarUrl
  const photos = useHostGallery(needsGallery ? host.id : null)
  if (host?.avatarUrl) return host.avatarUrl
  return photos && photos[0] ? photos[0].url : null
}
