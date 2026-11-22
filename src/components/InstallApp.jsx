import { useState } from 'react'
import { Download, Smartphone, Share, PlusSquare, CheckCircle2 } from 'lucide-react'
import { Button, Card } from './ui'
import { useInstallPrompt, APK_URL } from '../lib/pwa'

// "Get the Vibe app": the real install dialog on Chrome/Edge, Add-to-Home-Screen steps on
// iPhone, and an APK download when one is configured. Hidden when already running as the app,
// or when this browser can't offer any of them (unless `always`, used on the /download page).
export function InstallAppCard({ className = '', always = false }) {
  const { canInstall, installed, ios, install } = useInstallPrompt()
  const [iosHelp, setIosHelp] = useState(false)
  const [done, setDone] = useState(false)

  if (installed && !always) return null
  if (!always && !canInstall && !ios && !APK_URL) return null

  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <img src="/icons/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-xl" />
        <div className="flex-1 text-left">
          <p className="text-[15px] font-bold text-ink">Get the Vibe app</p>
          <p className="text-[12px] text-subtle">Opens full-screen from your home screen — faster, like any app.</p>
        </div>
      </div>

      {installed ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-green-500/10 px-3 py-2.5 text-[13px] font-semibold text-green-600">
          <CheckCircle2 size={16} /> You're using the app.
        </p>
      ) : done ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-green-500/10 px-3 py-2.5 text-[13px] font-semibold text-green-600">
          <CheckCircle2 size={16} /> Installed — find Vibe on your home screen.
        </p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {canInstall && (
            <Button className="w-full py-3" onClick={async () => setDone(await install())}>
              <Download size={16} /> Install app
            </Button>
          )}
          {ios && !canInstall && (
            <Button className="w-full py-3" onClick={() => setIosHelp((v) => !v)}>
              <PlusSquare size={16} /> Add to Home Screen
            </Button>
          )}
          {APK_URL && (
            <Button as="a" href={APK_URL} download variant="outline" className="w-full py-3">
              <Smartphone size={16} /> Download APK (Android)
            </Button>
          )}
        </div>
      )}

      {iosHelp && (
        <ol className="mt-3 space-y-1.5 rounded-xl bg-gray-50 p-3 text-left text-[13px] text-ink dark:bg-white/5">
          <li>1. In <b>Safari</b>, tap <Share size={13} className="inline -mt-0.5" /> <b>Share</b> at the bottom.</li>
          <li>2. Scroll and tap <b>Add to Home Screen</b>.</li>
          <li>3. Tap <b>Add</b>. Vibe appears on your home screen.</li>
        </ol>
      )}

      {always && !installed && !canInstall && !ios && !APK_URL && (
        <p className="mt-3 text-left text-[13px] leading-relaxed text-subtle">
          Open this page in <b>Chrome</b> on Android (or Chrome/Edge on a computer) and tap <b>Install app</b>, or use the
          browser menu → <b>Install app</b> / <b>Add to Home screen</b>.
        </p>
      )}
    </Card>
  )
}

// Public, shareable page: vibe-site/download — works without logging in.
export default function DownloadPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-[#3a2568] via-[#1a1236] to-[#0b0814] p-5">
      <div className="w-full max-w-md text-center">
        <img src="/logo.png" alt="Vibe" className="mx-auto h-16 w-16 rounded-2xl object-contain" />
        <h1 className="mt-4 text-[26px] font-extrabold text-white">Get Vibe</h1>
        <p className="mt-1 text-[14px] text-white/60">Real conversations with creators — chat, call and watch live.</p>
        <InstallAppCard always className="mt-6" />
        <a href="/" className="mt-5 inline-block text-[14px] font-semibold text-white/80 underline">Continue in the browser</a>
      </div>
    </div>
  )
}
