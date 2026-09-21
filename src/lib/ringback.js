// Synthesizes a soft repeating ringback tone via the Web Audio API instead of
// shipping an audio file — no asset to host, and it stops cleanly the instant
// the call connects or ends. Returns a stop function.
export function startRingback() {
  let ctx
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
  } catch {
    return () => {}
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})

  let stopped = false
  let activeGain = null

  const beep = () => {
    if (stopped || ctx.state === 'closed') return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 480
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.05)
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.9)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 1)
    activeGain = gain
  }

  beep()
  const timer = setInterval(beep, 2000)

  return () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    // A beep that started just before the call connects has its fade-out
    // ramp already scheduled up to ~0.9s into the future — closing the
    // context doesn't cancel that, so without this the tail is still
    // audible for up to a second after the call is already answered.
    // Cancelling the ramp and forcing the gain to 0 first cuts it instantly.
    if (activeGain) {
      try {
        activeGain.gain.cancelScheduledValues(ctx.currentTime)
        activeGain.gain.setValueAtTime(0, ctx.currentTime)
      } catch { /* ctx may already be closing */ }
    }
    ctx.close().catch(() => {})
  }
}
