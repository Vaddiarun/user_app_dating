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
  }

  beep()
  const timer = setInterval(beep, 2000)

  return () => {
    stopped = true
    clearInterval(timer)
    ctx.close().catch(() => {})
  }
}
