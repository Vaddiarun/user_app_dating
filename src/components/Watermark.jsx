import { useEffect, useState } from 'react'
import { userName, shortRef } from '../lib/format'

// Nothing in a browser can stop a screen recording or an OS-level screenshot
// — there's no API for either, and live WebRTC video (unlike Netflix's
// pre-packaged, DRM-licensed streams) has no hardware-secured decode path to
// route through even in principle. So instead of pretending to block it,
// this burns the viewer's identity into the video area itself — as real DOM
// content layered over the <video> element, not a video-track overlay — so
// it survives *any* capture method (screenshot, screen recording, a second
// phone photographing the screen) exactly because the capture method never
// gets a say in what's on screen. It drifts between safe-zone positions so a
// static crop can't reliably remove it. It won't stop a leak, but it makes
// one traceable.

// 9 safe positions on a 3x3 grid, inset from the edges so nothing ever sits
// on top of the top bar or the bottom control tray.
const POSITIONS = [
  { top: '16%', left: '6%', align: 'left' },
  { top: '16%', left: '50%', align: 'center' },
  { top: '16%', left: '94%', align: 'right' },
  { top: '46%', left: '6%', align: 'left' },
  { top: '46%', left: '50%', align: 'center' },
  { top: '46%', left: '94%', align: 'right' },
  { top: '74%', left: '6%', align: 'left' },
  { top: '74%', left: '50%', align: 'center' },
  { top: '74%', left: '94%', align: 'right' },
]

function randomPosition(excludeIdx) {
  if (POSITIONS.length <= 1) return { pos: POSITIONS[0], idx: 0 }
  let idx
  do { idx = Math.floor(Math.random() * POSITIONS.length) } while (idx === excludeIdx)
  return { pos: POSITIONS[idx], idx }
}

function alignTranslateX(align) {
  return align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0%'
}

function Layer({ text, moveMs, small }) {
  const [{ pos, idx }, setState] = useState(() => randomPosition(-1))

  useEffect(() => {
    const iv = setInterval(() => setState((s) => randomPosition(s.idx)), moveMs)
    return () => clearInterval(iv)
  }, [moveMs])

  return (
    <div
      className={`pointer-events-none absolute z-[60] select-none whitespace-pre-line text-center font-semibold text-white/40 transition-all ease-in-out ${small ? 'text-[9px] leading-tight duration-[3000ms]' : 'text-[11px] leading-tight duration-[2500ms]'}`}
      style={{
        top: pos.top,
        left: pos.left,
        transform: `translate(${alignTranslateX(pos.align)}, -50%)`,
        // A flat low-opacity color only reads against video content darker
        // than itself — against a light wall, light sky, a bright shirt, it's
        // functionally invisible, which defeats the point of a *traceable*
        // watermark. A dark shadow ringing the text keeps it legible against
        // arbitrary, unpredictable video content in either direction.
        textShadow: '0 0 3px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.85), 0 -1px 2px rgba(0,0,0,0.85)',
      }}
    >
      {text}
    </div>
  )
}

// `sessionId` + `secure` opt into the fuller identity/session watermark used
// for calls; existing callers (Live.jsx) that only ever pass `user` keep
// their original single-line "name · time" watermark, unchanged.
export default function Watermark({ user, sessionId, secure = false, layers = 1 }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  if (!secure) {
    const stamp = now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    return <Layer text={`${userName(user)} · ${stamp}`} moveMs={4000} />
  }

  const stamp = now.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const primaryText = [
    `USER: ${userName(user)}`,
    `ID: ${shortRef(user?.id)}`,
    sessionId ? `CALL: ${shortRef(sessionId)}` : null,
    stamp,
    'CONFIDENTIAL',
  ].filter(Boolean).join('\n')
  const secondaryText = `${shortRef(user?.id)} · ${stamp}`

  return (
    <>
      <Layer text={primaryText} moveMs={4000} />
      {/* Second, independently-moving layer with different content and
          timing — the two rarely end up in the same spot at the same time,
          so cropping one out of a screenshot doesn't remove the other. */}
      {layers > 1 && <Layer text={secondaryText} moveMs={5500} small />}
    </>
  )
}
