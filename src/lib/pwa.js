// "Install the app" support. Chrome/Edge (Android and desktop) fire `beforeinstallprompt` once
// the site qualifies as an installable PWA (manifest + service worker); we keep that event so an
// "Install app" button can open the real install dialog later. iPhone Safari never fires it —
// there people add the site with Share → Add to Home Screen, so we show those steps instead.
import { useEffect, useState } from 'react'

let deferredPrompt = null
const listeners = new Set()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  // Registered at import time (main.jsx imports this first) — the event can fire before React mounts.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)

// Optional direct APK download (e.g. built with PWABuilder from this site). The button only shows
// once this is set in .env / Vercel.
export const APK_URL = import.meta.env.VIBE_ANDROID_APK_URL || ''

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* app still works, just not installable */ })
  })
}

export function useInstallPrompt() {
  const [, rerender] = useState(0)
  useEffect(() => {
    const l = () => rerender((n) => n + 1)
    listeners.add(l)
    return () => listeners.delete(l)
  }, [])

  return {
    canInstall: !!deferredPrompt,
    installed: isStandalone(),
    ios: isIOS(),
    android: isAndroid(),
    install: async () => {
      if (!deferredPrompt) return false
      const prompt = deferredPrompt
      deferredPrompt = null
      notify()
      prompt.prompt()
      const { outcome } = await prompt.userChoice
      return outcome === 'accepted'
    },
  }
}
