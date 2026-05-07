import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if dismissed recently (7 days)
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const daysSince = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // MUST call preventDefault() to capture the event — this is correct behavior
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallBanner(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowInstallBanner(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (!showInstallBanner || isInstalled) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9990] animate-slide-up sm:left-auto sm:right-4 sm:w-96">
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-2xl shadow-2xl p-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-lg">
          <img src="/icon-192.png" alt="Schofy" className="w-10 h-10 rounded-lg object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
          <Smartphone size={24} className="text-indigo-600 hidden" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm">Install Schofy</p>
          <p className="text-indigo-100 text-xs">Add to home screen for offline access</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleInstall}
            className="px-3 py-1.5 bg-white text-indigo-600 rounded-lg font-bold text-sm hover:bg-indigo-50 transition-colors"
          >
            Install
          </button>
          <button onClick={handleDismiss} className="p-1.5 text-white/70 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
