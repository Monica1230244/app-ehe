import { useEffect, useState } from 'react';

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    setShowIosHelp(isIos && !isInstalled());

    function handlePrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function handleInstalled() {
      setInstallPrompt(null);
      setShowIosHelp(false);
    }

    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if ((!installPrompt && !showIosHelp) || isInstalled()) return null;

  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }

    window.alert('Sur iPhone/iPad : ouvrez ce lien dans Safari, touchez Partager, puis « Sur l’écran d’accueil ».');
  }

  return (
    <button type="button" onClick={install} className="fixed bottom-4 left-4 z-50 rounded bg-blue-700 px-4 py-3 font-semibold text-white shadow-lg">
      Installer EHE ERP
    </button>
  );
}
