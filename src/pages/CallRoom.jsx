import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Mic, MicOff, MessageSquare, Gift, PhoneOff, X, AlertTriangle, Wallet, RotateCw, SwitchCamera, HeartHandshake, Send,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Avatar, Button } from '../components/ui'
import { clock } from '../lib/format'
import GiftPicker from '../components/GiftPicker'
import Watermark from '../components/Watermark'
import { callsApi, hostsApi, giftsApi, chatApi, ApiError } from '../lib/api'
import { normalizeHost, normalizeGift } from '../lib/normalize'
import { joinAndPublish, leaveChannel, PLAY_CONFIG, listCameras, switchCameraFacing } from '../lib/agora'
import { getSocket, onSocketEvent } from '../lib/socket'
import { startRingback } from '../lib/ringback'
import { logSecurityEvent, isDisplayCaptureApiSupported } from '../lib/security'

const POLL_MS = 5000
// The backend's real call_status enum (calls.status) — ringing/ongoing are
// in-progress, everything else is terminal.
const TERMINAL_CALL_STATUSES = ['completed', 'rejected', 'missed', 'failed']

export default function CallRoom() {
  const { id: hostId } = useParams()
  const [sp] = useSearchParams()
  const mode = sp.get('mode') || 'video'
  const nav = useNavigate()
  const { state, actions, toast } = useApp()

  const [c, setC] = useState(null)
  const [call, setCall] = useState(null) // { callId, ratePaise, channelName, agoraToken }
  const [phase, setPhase] = useState('connecting') // connecting | active | error
  const [error, setError] = useState('')
  const [errorKind, setErrorKind] = useState('generic') // 'balance' | 'generic'
  const [seconds, setSeconds] = useState(0)
  const [ringSeconds, setRingSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [gift, setGift] = useState(false)
  const [chatLog, setChatLog] = useState([])
  const [chatText, setChatText] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatErr, setChatErr] = useState('')
  const [rtcErr, setRtcErr] = useState('') // fatal — mic/join never came up, call has no audio at all
  const [camErr, setCamErr] = useState('') // non-fatal — camera specifically failed, audio still works
  const [remoteJoined, setRemoteJoined] = useState(false)
  const [swapped, setSwapped] = useState(false) // which video is full-screen vs the small PIP tile
  const [cameras, setCameras] = useState([])
  const [facing, setFacing] = useState('user')
  const [flipping, setFlipping] = useState(false)
  const [pageHidden, setPageHidden] = useState(false)
  const [pipDragPos, setPipDragPos] = useState(null) // {x,y} px within the stage once dragged; null = default corner
  const [giftRequest, setGiftRequest] = useState(null) // { gift: normalizedGift|null, sending }

  const [attempt, setAttempt] = useState(0)
  const endedRef = useRef(false)
  const acceptedRef = useRef(false)
  const initiatedKeyRef = useRef(null) // guards against StrictMode's dev-only double-effect placing two real POST /calls
  const initPromiseRef = useRef(null)
  const navRef = useRef(nav)
  navRef.current = nav
  const secondsRef = useRef(0)
  secondsRef.current = seconds
  const callRef = useRef(null)
  callRef.current = call
  const sessionRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const localVideoRef = useRef(null)
  const stageRef = useRef(null)
  const pipRef = useRef(null)
  const pipDragRef = useRef({ dragging: false, pointerId: null, startClientX: 0, startClientY: 0, startX: 0, startY: 0, moved: 0 })
  const chatFeedRef = useRef(null)

  // set up: fetch host (for name/avatar/rate) + initiate the call. The backend
  // hands back this user's own Agora channel/token right here (POST /calls) —
  // there's nothing more to fetch once the host accepts, just a join to do.
  //
  // React StrictMode intentionally mounts, cleans up, then re-mounts every
  // component once in dev, running this effect twice on the same instance.
  // The ref guard below stops a second real POST /calls going out — but a
  // first version of that guard skipped straight past the promise itself,
  // which meant the *result* got lost too: StrictMode's synthetic cleanup set
  // `alive = false` on the one invocation that actually owned the in-flight
  // request, and the replay invocation — the one whose `alive` stayed true —
  // never touched that request's `.then()/.catch()` at all. So a real error
  // (e.g. "Insufficient balance") came back from the network, and nothing
  // ever showed it — the screen just sat on "Connecting…" forever. Fix: store
  // the promise itself in a ref, created once, and let *every* effect
  // invocation (both the original and the StrictMode replay) attach its own
  // `.then()/.catch()` to that same shared promise — whichever invocation is
  // still "alive" when it resolves applies the result.
  useEffect(() => {
    const key = `${hostId}:${mode}:${attempt}`
    if (initiatedKeyRef.current !== key) {
      initiatedKeyRef.current = key
      initPromiseRef.current = Promise.all([
        hostsApi.get(hostId).catch(() => null),
        callsApi.initiate(hostId, mode === 'audio' ? 'voice' : mode),
      ])
    }
    let alive = true
    initPromiseRef.current
      .then(([hostRes, callRes]) => {
        if (!alive) return
        const host = hostRes ? normalizeHost(hostRes) : null
        setC(host)
        setCall({
          callId: callRes.callId || callRes.id,
          ratePaise: callRes.ratePerMinutePaise ?? callRes.ratePaise ?? host?.ratePaise ?? 0,
          channelName: callRes.channelName,
          agoraToken: callRes.agoraToken,
        })
      })
      .catch((err) => {
        if (!alive) return
        const msg = err instanceof ApiError ? err.message : 'Could not connect this call'
        setError(msg)
        setErrorKind(/insufficient balance/i.test(msg) ? 'balance' : 'generic')
        setPhase('error')
      })
    return () => { alive = false }
  }, [hostId, mode, attempt]) // eslint-disable-line

  const markAccepted = () => {
    if (acceptedRef.current) return
    acceptedRef.current = true
    setPhase('active')
  }

  const handleServerEnd = (status, totalAmountPaise) => {
    if (endedRef.current) return
    endedRef.current = true
    if (sessionRef.current) { leaveChannel(sessionRef.current); sessionRef.current = null }
    const st = (status || '').toLowerCase()
    const amt = totalAmountPaise ?? ''
    const cid = callRef.current?.callId
    const q = `?d=${secondsRef.current}${amt !== '' ? `&amt=${amt}` : ''}${cid ? `&cid=${cid}` : ''}`
    // missed/rejected/failed means the call never really connected — same
    // "didn't go through" outcome screen as a ringing timeout; only a call
    // that actually ran (completed) gets the rate-this-call summary. `st` is
    // the backend's own status string (missed/rejected/failed), which lines
    // up directly with CallEnded's reason keys — so it also tells that screen
    // *which* "didn't connect" outcome this actually was.
    navRef.current(st === 'completed' ? `/call-summary/${hostId}${q}` : `/call-ended/${hostId}${q}&reason=${st}`, { replace: true })
  }

  // Cancel/hang-up must always do *something* — previously this bailed out
  // entirely if `call` hadn't been set yet (e.g. tapping Cancel in the brief
  // window before POST /calls resolves), leaving the button completely dead
  // and the user stuck on the connecting screen with no way out.
  const finish = async (reason) => {
    if (endedRef.current) return
    endedRef.current = true
    if (sessionRef.current) { await leaveChannel(sessionRef.current); sessionRef.current = null }
    const cid = callRef.current?.callId
    const wasActive = acceptedRef.current
    if (!cid) {
      // Never got a callId back from the backend (still initiating, or it
      // never succeeded) — there's nothing server-side to end, just leave.
      navRef.current('/', { replace: true })
      return
    }
    try {
      const res = await callsApi.end(cid)
      actions.refreshWallet().catch(() => {})
      // The end-call response carries totalAmountPaise but no duration field —
      // the client's own elapsed timer is the only source for that. The user is
      // shown what they paid (₹), never totalBeans (the host's post-commission earnings).
      const amt = res.totalAmountPaise ?? ''
      const q = `?d=${secondsRef.current}${amt !== '' ? `&amt=${amt}` : ''}&cid=${cid}`
      // A call cancelled/timed out while still ringing never connected — same
      // "didn't go through" screen regardless of why, not the rate-this-call
      // summary (that's only for a call that actually ran).
      // A ring timeout and a manual cancel-while-ringing are both, from the
      // caller's point of view, just "nobody picked up" / "I hung up before
      // it connected" — map them onto CallEnded's reason keys.
      const endReason = reason === 'timeout' ? 'missed' : reason === 'balance' ? 'balance' : 'cancelled'
      const dest = reason === 'addbalance'
        ? '/add-balance'
        : reason === 'balance' || !wasActive
          ? `/call-ended/${hostId}${q}&reason=${endReason}`
          : `/call-summary/${hostId}${q}`
      navRef.current(dest, { replace: true })
    } catch {
      navRef.current('/', { replace: true })
    }
  }
  const finishRef = useRef(finish)
  finishRef.current = finish

  // Realtime: the host accepting/ending the call reaches us near-instantly over the
  // socket (same call:accepted/call:ended events RealtimeBridge uses on the host app).
  // Scoped to this callId so a stale listener from a previous call can't fire here.
  useEffect(() => {
    if (!call?.callId) return
    let cancelled = false
    const unsubs = []
    const attach = () => {
      const socket = getSocket()
      if (!socket) {
        if (!cancelled) setTimeout(attach, 300)
        return
      }
      unsubs.push(onSocketEvent('call:accepted', (payload) => {
        if (payload?.callId !== call.callId) return
        markAccepted()
      }))
      unsubs.push(onSocketEvent('call:ended', (payload) => {
        if (payload?.callId !== call.callId) return
        handleServerEnd(payload?.status, payload?.totalAmountPaise)
      }))
      // The host asking for a gift mid-call — the event only carries hostId
      // (no callId), so it's scoped to "this call's host" instead; a user is
      // only ever in one call at a time, so that's an unambiguous match.
      unsubs.push(onSocketEvent('gift:requested', (payload) => {
        if (payload?.hostId !== hostId) return
        const giftId = payload?.suggestedGiftId
        if (!giftId) { setGiftRequest({ gift: null, sending: false }); return }
        setGiftRequest({ gift: null, sending: false })
        giftsApi.catalog()
          .then((res) => {
            const list = (res.gifts || res || []).map(normalizeGift)
            const match = list.find((g) => g.id === giftId) || null
            setGiftRequest((cur) => (cur ? { ...cur, gift: match } : cur))
          })
          .catch(() => {})
      }))
      // In-call chat toggle — scoped to "this call's host" the same way gift:requested is
      // above, since chat:message only carries senderId, no callId.
      unsubs.push(onSocketEvent('chat:message', (m) => {
        if (m?.senderId !== hostId) return
        setChatLog((l) => [...l, { id: m.messageId, senderId: m.senderId, content: m.content }])
      }))
    }
    attach()
    return () => {
      cancelled = true
      unsubs.forEach((u) => u())
    }
  }, [call?.callId]) // eslint-disable-line

  // Poll fallback (in case a socket event is missed) — also doubles as the only
  // way we'd detect acceptance if the socket never connects. Runs continuously
  // once the call exists, not just once "active", so a reject/timeout while
  // still ringing is caught too.
  useEffect(() => {
    if (!call?.callId) return
    const iv = setInterval(async () => {
      if (endedRef.current) return
      try {
        const [status, wallet] = await Promise.all([callsApi.get(call.callId), actions.refreshWallet()])
        const st = (status.status || '').toLowerCase()
        if (TERMINAL_CALL_STATUSES.includes(st)) {
          handleServerEnd(status.status, status.totalAmountPaise)
        } else if (st === 'ongoing') {
          markAccepted()
        }
        void wallet
      } catch { }
    }, POLL_MS)
    return () => clearInterval(iv)
  }, [call?.callId]) // eslint-disable-line

  // local elapsed-time ticker (display only — billing itself is server-side)
  useEffect(() => {
    if (phase !== 'active') return
    const iv = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(iv)
  }, [phase])

  // ring-duration ticker — purely cosmetic, but reassures the caller the app
  // is actually still doing something rather than looking frozen while ringing
  useEffect(() => {
    if (phase !== 'connecting') { setRingSeconds(0); return }
    const iv = setInterval(() => setRingSeconds((s) => s + 1), 1000)
    return () => clearInterval(iv)
  }, [phase])

  // ringback tone while waiting for the host to accept
  useEffect(() => {
    if (phase !== 'connecting') return
    const stop = startRingback()
    return stop
  }, [phase])

  // Ring timeout — without this, an unanswered call rings forever with no way
  // out for the caller beyond a manual cancel. 45s unanswered auto-ends it.
  useEffect(() => {
    if (phase !== 'connecting' || !call?.callId) return
    const t = setTimeout(() => {
      if (!acceptedRef.current) finishRef.current('timeout')
    }, 45000)
    return () => clearTimeout(t)
  }, [phase, call?.callId])

  // Real Agora join, once the host has actually answered — mirrors the host
  // app's ActiveCall. Before this, the call screen showed "connected" the
  // moment it opened with no real audio/video ever established.
  useEffect(() => {
    if (phase !== 'active' || !call?.channelName || !call?.agoraToken) return
    let cancelled = false
    joinAndPublish({
      channelName: call.channelName,
      token: call.agoraToken,
      uid: state.user?.id,
      video: mode === 'video',
      onRemoteUser: (user, mediaType, left) => {
        // Agora fires this once per media type (audio and video publish/
        // subscribe independently) — this used to bail out entirely for
        // anything but 'video', so the caller's subscribed audio track was
        // never actually started. Subscribing alone doesn't play it; the
        // SDK requires an explicit .play() call, same as video.
        if (left) {
          if (mediaType === 'video') setRemoteJoined(false)
          return
        }
        if (mediaType === 'video') {
          user.videoTrack?.play(remoteVideoRef.current)
          setRemoteJoined(true)
        } else if (mediaType === 'audio') {
          user.audioTrack?.play()
        }
      },
    })
      .then((session) => {
        if (cancelled) { leaveChannel(session); return }
        sessionRef.current = session
        if (session.localVideoTrack) {
          session.localVideoTrack.play(localVideoRef.current, PLAY_CONFIG)
        } else if (session.videoError && mode === 'video') {
          // Audio still published fine (see lib/agora.js) — only the camera failed.
          setCamErr("Camera unavailable — check permissions or close other apps using it.")
        }
      })
      .catch((e) => {
        // The full SDK error (e.g. "NotSupportedError: Not supported" — no
        // getUserMedia access at all, insecure context, or no mic hardware)
        // is logged for debugging but never shown as-is; it's not something
        // a caller can act on. What they need is the same plain, actionable
        // framing as the camera-only case.
        console.error('Agora join failed:', e)
        setRtcErr("Couldn't access your microphone. Check mic permissions for this site and that no other app is using it.")
      })
    return () => {
      cancelled = true
      if (sessionRef.current) { leaveChannel(sessionRef.current); sessionRef.current = null }
    }
  }, [phase, call?.channelName, call?.agoraToken]) // eslint-disable-line

  useEffect(() => { sessionRef.current?.localAudioTrack?.setEnabled(!muted) }, [muted])

  // Without this, new messages append at the bottom of the DOM but the
  // scrolled view stays wherever it was — usually the top, showing old
  // messages — so a new one never becomes visible until the user manually
  // scrolls down. Instagram/WhatsApp always follow the latest message; this
  // does the same.
  useEffect(() => {
    chatFeedRef.current?.scrollTo({ top: chatFeedRef.current.scrollHeight, behavior: 'smooth' })
  }, [chatLog.length])

  // Camera list is only fetchable once we hold a live camera permission (i.e.
  // after the join actually acquired one) — fetching it any earlier would
  // itself trigger a permission prompt. Most desktops only expose one camera,
  // so the flip control only renders once there's actually something to
  // switch to.
  useEffect(() => {
    if (phase !== 'active' || mode !== 'video' || !sessionRef.current?.localVideoTrack) return
    listCameras().then(setCameras).catch(() => {})
  }, [phase, mode, remoteJoined])

  const flipCamera = async () => {
    const session = sessionRef.current
    if (!session?.client || flipping) return
    setFlipping(true)
    try {
      const next = facing === 'user' ? 'environment' : 'user'
      const newTrack = await switchCameraFacing(session.client, session.localVideoTrack, next)
      session.localVideoTrack = newTrack
      newTrack.play(localVideoRef.current, PLAY_CONFIG)
      setFacing(next)
    } catch {
      toast('Could not switch camera', { tone: 'error' })
    } finally {
      setFlipping(false)
    }
  }

  // WhatsApp-style freely-draggable PIP. Pointer Events (not separate mouse/
  // touch handlers) cover mouse, touch, and pen in one code path. Position is
  // tracked as {x,y} pixel offsets relative to the stage container, computed
  // fresh from getBoundingClientRect() at drag time so it stays correct
  // across rotation/resizes and whether the low-balance banner is currently
  // taking up space at the bottom of the stage.
  const TAP_THRESHOLD_PX = 4
  const DRAG_MARGIN = 8

  const clampPipPos = (x, y) => {
    const stage = stageRef.current
    const pip = pipRef.current
    if (!stage || !pip) return { x, y }
    const stageRect = stage.getBoundingClientRect()
    const pipRect = pip.getBoundingClientRect()
    const maxX = Math.max(DRAG_MARGIN, stageRect.width - pipRect.width - DRAG_MARGIN)
    const maxY = Math.max(DRAG_MARGIN, stageRect.height - pipRect.height - DRAG_MARGIN)
    return { x: Math.min(Math.max(x, DRAG_MARGIN), maxX), y: Math.min(Math.max(y, DRAG_MARGIN), maxY) }
  }

  const onPipPointerDown = (e) => {
    const stage = stageRef.current
    const pip = pipRef.current
    if (!stage || !pip) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const stageRect = stage.getBoundingClientRect()
    const pipRect = pip.getBoundingClientRect()
    pipDragRef.current = {
      dragging: true,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      // Falls back to the tile's current on-screen position (converted into
      // stage-relative coordinates) the first time it's ever dragged, since
      // before that it's positioned by the top-4/right-4 CSS classes, not state.
      startX: pipDragPos ? pipDragPos.x : pipRect.left - stageRect.left,
      startY: pipDragPos ? pipDragPos.y : pipRect.top - stageRect.top,
      moved: 0,
    }
  }

  const onPipPointerMove = (e) => {
    const d = pipDragRef.current
    if (!d.dragging || e.pointerId !== d.pointerId) return
    const dx = e.clientX - d.startClientX
    const dy = e.clientY - d.startClientY
    d.moved = Math.max(d.moved, Math.hypot(dx, dy))
    setPipDragPos(clampPipPos(d.startX + dx, d.startY + dy))
  }

  const onPipPointerUp = (e) => {
    const d = pipDragRef.current
    if (!d.dragging || e.pointerId !== d.pointerId) return
    pipDragRef.current = { ...d, dragging: false }
    // Movement stayed under the threshold — this was a tap, not a drag, so
    // it still gets the existing tap-to-swap behavior. Anything past it was
    // a deliberate drag, which must NOT also trigger a swap.
    if (d.moved < TAP_THRESHOLD_PX) setSwapped((s) => !s)
  }

  const acceptGiftRequest = async (g) => {
    if (!g || giftRequest?.sending) return
    setGiftRequest((cur) => (cur ? { ...cur, sending: true } : cur))
    try {
      await giftsApi.send(hostId, g.id, 'call', call?.callId)
      await actions.refreshWallet()
      toast(`Sent ${g.name}`)
      setChatLog((l) => [...l, { text: `Sent a ${g.name}` }])
      setGiftRequest(null)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send gift', { tone: 'error' })
      setGiftRequest((cur) => (cur ? { ...cur, sending: false } : cur))
    }
  }

  const declineGiftRequest = () => {
    setGiftRequest(null)
    giftsApi.declineRequest(hostId).catch(() => {})
  }

  const sendChatMessage = async () => {
    const content = chatText.trim()
    if (!content || chatSending) return
    setChatSending(true)
    setChatErr('')
    setChatText('')
    try {
      const res = await chatApi.send(hostId, content)
      setChatLog((l) => [...l, { id: res.messageId, senderId: res.senderId, content: res.content }])
    } catch (err) {
      setChatText(content)
      setChatErr(err instanceof ApiError ? err.message : 'Could not send that message.')
    } finally {
      setChatSending(false)
    }
  }

  // Shown once when the call actually connects, not on every render/reconnect —
  // a non-intrusive, honest notice (it doesn't claim capture is blocked, only
  // that identity is embedded in the video, which the watermark above makes true).
  const noticeShownRef = useRef(false)
  useEffect(() => {
    if (phase !== 'active' || noticeShownRef.current) return
    noticeShownRef.current = true
    toast('Screen capture and recording are prohibited. Your identity is embedded in this video.', { duration: 4500 })
  }, [phase]) // eslint-disable-line

  // Page Visibility API: real and universal, but it only ever tells you the
  // tab was backgrounded — no mobile OS fires this for its screenshot or
  // screen-recording gestures, so this is a privacy nicety (don't leave the
  // video visible if someone glances at a backgrounded/minimized tab), not a
  // capture detector. Audio/the call itself keeps running untouched; only the
  // on-screen video is blurred and unblurred.
  useEffect(() => {
    const onVisibility = () => {
      const hidden = document.visibilityState === 'hidden'
      setPageHidden(hidden)
      if (hidden) logSecurityEvent('PAGE_HIDDEN', { context: 'call', contextId: callRef.current?.callId })
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // There is no browser API, on any platform, that tells a page someone else
  // is recording its screen — getDisplayMedia only ever reports a stream this
  // page itself requested (e.g. a "share my screen" feature), which this app
  // doesn't have. So this is a feature-detection stub only: it records whether
  // the API exists at all, ready to wire up the day a real self-initiated
  // capture flow needs it, and never claims to detect a capture that has no
  // technical signal to detect.
  useEffect(() => {
    if (phase === 'active' && isDisplayCaptureApiSupported()) {
      logSecurityEvent('DISPLAY_CAPTURE_API_AVAILABLE', { context: 'call', contextId: call?.callId })
    }
  }, [phase]) // eslint-disable-line

  const remainingSec = useMemo(() => {
    if (!call?.ratePaise || !state.wallet) return Infinity
    return Math.floor((state.wallet.balancePaise / call.ratePaise) * 60)
  }, [call?.ratePaise, state.wallet])

  useEffect(() => {
    if (phase === 'active' && remainingSec <= 0) finishRef.current('balance')
  }, [phase, remainingSec])

  if (phase === 'error') {
    const isBalance = errorKind === 'balance'
    const retry = () => {
      setError('')
      setErrorKind('generic')
      setPhase('connecting')
      setAttempt((a) => a + 1)
    }
    return (
      <div className="fixed inset-0 z-[70] grid place-items-center bg-gradient-to-b from-[#3a2568] via-[#1a1236] to-[#0b0814] p-6 text-white">
        <div className="w-full max-w-xs rounded-3xl bg-black/40 p-6 text-center backdrop-blur">
          <span className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${isBalance ? 'bg-gold/20 text-gold' : 'bg-rose-500/20 text-rose-400'}`}>
            {isBalance ? <Wallet size={28} /> : <AlertTriangle size={28} />}
          </span>
          <h1 className="mt-4 text-[17px] font-bold">{isBalance ? 'Not enough balance' : "Couldn't connect this call"}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-white/60">
            {isBalance ? "You don't have enough balance to start this call. Add balance to continue." : error}
          </p>
          <div className="mt-5 flex flex-col gap-2.5">
            {isBalance ? (
              <Button variant="gold" className="w-full py-3" onClick={() => nav('/add-balance')}>
                <Wallet size={15} /> Add balance
              </Button>
            ) : (
              <Button className="w-full py-3" onClick={retry}>
                <RotateCw size={15} /> Try again
              </Button>
            )}
            <button onClick={() => nav(-1)} className="w-full rounded-xl bg-white/10 py-3 text-[14px] font-semibold hover:bg-white/15">Go back</button>
          </div>
        </div>
      </div>
    )
  }

  const lowBalance = phase === 'active' && remainingSec < 120

  return (
    <div
      className="fixed inset-0 z-[70] flex select-none flex-col overflow-hidden text-white"
      style={{ background: 'linear-gradient(180deg,#3a2568 0%,#1a1236 45%,#0b0814 100%)' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* top bar */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2 rounded-full bg-black/35 px-3 py-1.5">
          <Avatar id={hostId} size={22} />
          <span className="text-[13px] font-semibold">{c?.name || '…'}</span>
          {phase === 'active' && <span className="text-[12px] text-white/70">⏱ {clock(seconds)}</span>}
        </div>
        <div className="flex items-center gap-2">
          {call?.ratePaise ? (
            <span className="rounded-full border border-gold/40 bg-black/35 px-3 py-1.5 text-[13px] font-semibold text-gold">
              ₹{(call.ratePaise / 100).toFixed(0)}/min
            </span>
          ) : null}
          <button onClick={() => finish('user')} className="grid h-8 w-8 place-items-center rounded-full bg-black/35"><X size={16} /></button>
        </div>
      </div>

      {/* stage */}
      <div ref={stageRef} className="relative flex flex-1 items-center justify-center">
        {phase === 'active' && <Watermark user={state.user} sessionId={call?.callId} secure layers={2} />}
        {mode === 'video' && phase === 'active' && (() => {
          // Whichever slot is the small PIP always gets z-10 — both boxes are
          // `position: absolute` siblings with no stacking context of their
          // own, so without it the one painted later would sit on top and
          // hide the other regardless of which one is visually meant to be on top.
          const fullClass = 'absolute inset-0'
          const pipClass = 'absolute right-4 top-4 z-10 h-36 w-28 overflow-hidden rounded-2xl'
          // The PIP tile is freely draggable (WhatsApp-style) regardless of
          // which video currently occupies it after a swap — these handlers
          // and the drag-offset style apply to whichever box gets `pipClass`
          // below, never to the full-screen one.
          const pipDragStyle = {
            touchAction: 'none',
            ...(pipDragPos ? { left: pipDragPos.x, top: pipDragPos.y, right: 'auto', bottom: 'auto' } : {}),
          }
          const pipHandlers = {
            ref: pipRef,
            onPointerDown: onPipPointerDown,
            onPointerMove: onPipPointerMove,
            onPointerUp: onPipPointerUp,
            onPointerCancel: onPipPointerUp,
          }
          return (
            <>
              <div
                {...(swapped ? pipHandlers : { onClick: () => setSwapped((s) => !s) })}
                className={swapped ? pipClass : fullClass}
                style={swapped ? pipDragStyle : undefined}
              >
                <div ref={remoteVideoRef} className="absolute inset-0" />
                {!remoteJoined && (
                  <div className="absolute inset-0 grid place-items-center">
                    {rtcErr ? (
                      <p className="max-w-[240px] px-8 text-center text-[13px] text-white/60">{rtcErr}</p>
                    ) : (
                      <div className={swapped ? 'h-16 w-16 rounded-full bg-white/5' : 'h-64 w-64 rounded-full bg-white/5'} />
                    )}
                  </div>
                )}
              </div>

              <div
                {...(swapped ? { onClick: () => setSwapped((s) => !s) } : pipHandlers)}
                className={swapped ? fullClass : pipClass}
                style={{
                  ...(!swapped ? { background: 'radial-gradient(circle at 40% 35%,#7f9bd6,#4a6bb0)' } : {}),
                  ...(!swapped ? pipDragStyle : {}),
                }}
              >
                <div ref={localVideoRef} className="absolute inset-0" />
                {/* This is the one place that's always about *your own* outgoing
                    media specifically — it has to stay visible regardless of
                    whether the host's video has come through. */}
                {(rtcErr || camErr) && (
                  <div className={`absolute inset-0 grid place-items-center bg-black/60 text-center text-white/85 ${swapped ? 'p-6 text-[13px]' : 'p-1.5 text-[9px] leading-tight'}`}>
                    {rtcErr || camErr}
                  </div>
                )}
                {cameras.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); flipCamera() }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    disabled={flipping}
                    className={
                      swapped
                        ? 'absolute bottom-20 right-4 grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white disabled:opacity-50'
                        : 'absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/50 text-white disabled:opacity-50'
                    }
                  >
                    <SwitchCamera size={swapped ? 20 : 13} />
                  </button>
                )}
              </div>
            </>
          )
        })()}

        {giftRequest && phase === 'active' && (
          <div className="absolute inset-x-4 top-3 z-[63] rounded-2xl bg-black/60 p-3 backdrop-blur">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold/20 text-gold"><HeartHandshake size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-white">
                  {c?.name || 'Host'} is requesting a gift
                </p>
                <p className="truncate text-[12px] text-white/60">
                  {giftRequest.gift
                    ? `${giftRequest.gift.name} · ₹${Math.round(giftRequest.gift.pricePaise / 100)}`
                    : 'Choose a gift to send'}
                </p>
              </div>
            </div>
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={() => {
                  if (giftRequest.gift) { acceptGiftRequest(giftRequest.gift); return }
                  setGift(true)
                  setGiftRequest(null)
                }}
                disabled={giftRequest.sending}
                className="flex-1 rounded-xl bg-gold py-2 text-[13px] font-bold text-ink disabled:opacity-60"
              >
                {giftRequest.sending ? 'Sending…' : giftRequest.gift ? 'Yes, send' : 'Choose gift'}
              </button>
              <button
                onClick={declineGiftRequest}
                disabled={giftRequest.sending}
                className="flex-1 rounded-xl bg-white/10 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {pageHidden && phase === 'active' && (
          <div className="absolute inset-0 z-[65] flex items-center justify-center bg-black/90 backdrop-blur-2xl">
            <p className="px-8 text-center text-[13px] text-white/60">Video paused while this tab isn't in view</p>
          </div>
        )}

        {phase === 'connecting' && (
          <div className="flex flex-col items-center">
            <div className="relative grid place-items-center">
              {/* `absolute` with no inset has no offset to center via place-items
                  (that only positions in-flow grid children) — inset-0 + m-auto
                  centers a fixed-size absolute box reliably regardless of the
                  parent's layout mode. */}
              <span className="absolute inset-0 m-auto h-[168px] w-[168px] rounded-full border-2 border-white/25 animate-ringPulse" />
              <span className="absolute inset-0 m-auto h-[168px] w-[168px] rounded-full border-2 border-white/25 animate-ringPulse [animation-delay:0.7s]" />
              <span className="absolute inset-0 m-auto h-[168px] w-[168px] rounded-full border-2 border-white/25 animate-ringPulse [animation-delay:1.4s]" />
              <div className="relative animate-breathe rounded-full border border-white/25 p-3">
                <Avatar id={hostId} size={150} />
              </div>
            </div>
            <p className="mt-6 text-[22px] font-bold">{c?.name || '…'}</p>
            <p className="mt-1.5 flex items-center text-[14px] text-white/70">
              Ringing
              <span className="ml-0.5 inline-flex">
                <span className="animate-dotBlink">.</span>
                <span className="animate-dotBlink [animation-delay:0.2s]">.</span>
                <span className="animate-dotBlink [animation-delay:0.4s]">.</span>
              </span>
            </p>
            {ringSeconds > 0 && <p className="mt-1 text-[12px] text-white/40">{clock(ringSeconds)}</p>}
          </div>
        )}

        {phase === 'active' && mode !== 'video' && (
          <div className="flex flex-col items-center">
            <div className="rounded-full border border-white/20 p-2"><Avatar id={hostId} size={150} /></div>
            <p className="mt-4 text-[20px] font-bold">{c?.name}</p>
            {rtcErr && <p className="mt-2 max-w-[240px] text-center text-[12px] text-white/60">{rtcErr}</p>}
          </div>
        )}

        {showChat && phase === 'active' && (
          <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-80 rounded-2xl flex flex-col">
            {/* max-h-40 (160px) is a flat cap that's fine in portrait but eats
                over half the screen in landscape/short viewports, where it
                visibly covers the host's video — clamp it to the viewport's
                own height instead so it always leaves the video mostly clear. */}
            <div ref={chatFeedRef} className="thin-scroll max-h-[28vh] min-h-0 space-y-1.5 overflow-y-auto p-3 text-[13px]">
              {chatLog.length === 0 && <p className="text-white/50">Messages during this call show up here.</p>}
              {chatLog.map((m, i) => (
                <p key={m.id ?? i} className={m.senderId && m.senderId === hostId ? 'text-left' : 'text-right'}>
                  <span className={`inline-block rounded-xl px-2.5 py-1 text-white ${m.senderId && m.senderId === hostId ? 'bg-white/15' : 'bg-brand'}`}>
                    {m.content ?? m.text}
                  </span>
                </p>
              ))}
            </div>
            {chatErr && <p className="px-3 pb-1 text-[11px] text-rose-300">{chatErr}</p>}
            <div className="flex items-center gap-2 p-2.5 pt-0">
              <input
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                placeholder="Message…"
                className="flex-1 rounded-full bg-white/10 text-white placeholder-white/40 px-3.5 py-2 text-[13px] outline-none"
              />
              <button onClick={sendChatMessage} disabled={chatSending || !chatText.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-ink disabled:opacity-50">
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* low balance */}
      {lowBalance && (
        <div className="mx-4 mb-3 flex items-center justify-between rounded-2xl bg-black/45 p-2.5 pl-3">
          <span className="flex items-center gap-2 text-[13px]">
            <AlertTriangle size={16} className="text-gold" /> Low balance — about {Math.max(1, Math.floor(remainingSec / 60))} min left
          </span>
          <button onClick={() => finish('addbalance')} className="rounded-lg bg-gold px-3 py-1.5 text-[13px] font-bold text-ink">Add</button>
        </div>
      )}

      {/* controls */}
      <div className="flex items-center justify-center gap-4 pb-8">
        <Ctrl onClick={() => setMuted((m) => !m)} active={muted}>{muted ? <MicOff size={20} /> : <Mic size={20} />}</Ctrl>
        <Ctrl onClick={() => setShowChat((s) => !s)} active={showChat}><MessageSquare size={20} /></Ctrl>
        <Ctrl onClick={() => setGift(true)}><Gift size={20} /></Ctrl>
        <button onClick={() => finish('user')} className="grid h-14 w-14 place-items-center rounded-full bg-rose-500 text-white">
          <PhoneOff size={22} />
        </button>
      </div>

      {gift && (
        <GiftPicker
          balance={state.wallet?.balancePaise ?? 0}
          onClose={() => setGift(false)}
          onSend={async (g) => {
            await giftsApi.send(hostId, g.id, 'call', call?.callId)
            await actions.refreshWallet()
            setGift(false)
            toast(`Sent ${g.name}`)
            setChatLog((l) => [...l, { text: `Sent a ${g.name}` }])
          }}
        />
      )}
    </div>
  )
}

function Ctrl({ children, onClick, active }) {
  return (
    <button onClick={onClick} className={`grid h-12 w-12 place-items-center rounded-full ${active ? 'bg-white text-ink' : 'bg-white/15 text-white'}`}>
      {children}
    </button>
  )
}
