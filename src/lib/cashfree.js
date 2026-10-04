// Cashfree checkout. The backend creates the order and gives us its
// paymentSessionId + checkoutMode ("sandbox" | "production"); we only open
// Cashfree's checkout with it. Whether the payment actually succeeded is never
// decided here — afterwards we ask the backend (which asks Cashfree), so a
// tampered client can't mark anything paid.
const SDK_URL = 'https://sdk.cashfree.com/js/v3/cashfree.js'

let sdkPromise = null

function loadSdk() {
  if (window.Cashfree) return Promise.resolve(window.Cashfree)
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SDK_URL
      script.onload = () => resolve(window.Cashfree)
      script.onerror = () => {
        sdkPromise = null
        reject(new Error('Could not load the payment page — check your connection and try again'))
      }
      document.head.appendChild(script)
    })
  }
  return sdkPromise
}

// Resolves when the checkout pop-up closes (paid, failed, or dismissed) —
// `error` is set if the user closed it or the payment failed. Some UPI /
// netbanking flows leave the page instead and come back via the order's
// return URL (?recharge_id= / ?purchase_id=), which the screens also handle.
//
// The modal is a fixed phone-sized pop-up, so on laptops/desktops we open
// Cashfree's full-page checkout instead (proper desktop layout). It leaves the
// page and comes back via the same return URL, so the promise only settles
// here if the checkout couldn't start.
const isDesktop = () =>
  window.matchMedia?.('(min-width: 768px) and (hover: hover) and (pointer: fine)').matches

export async function openCashfreeCheckout(paymentSessionId, mode) {
  const Cashfree = await loadSdk()
  const cashfree = Cashfree({ mode })
  if (!isDesktop()) return cashfree.checkout({ paymentSessionId, redirectTarget: '_modal' })
  const result = await cashfree.checkout({ paymentSessionId, redirectTarget: '_self' })
  if (result?.error) throw new Error(result.error.message || 'Could not open the payment page')
  return new Promise(() => {}) // navigating away to Cashfree — keep showing "processing"
}

// Polls a backend status call until it's no longer "created" (the backend
// confirms with Cashfree on every call). Cashfree usually settles within a
// few seconds of checkout closing; give up after ~30s and report "created".
export async function waitForSettlement(fetchStatus, { tries = 15, intervalMs = 2000 } = {}) {
  let latest = await fetchStatus()
  for (let i = 1; i < tries && latest.status === 'created'; i++) {
    await new Promise((r) => setTimeout(r, intervalMs))
    latest = await fetchStatus()
  }
  return latest
}
