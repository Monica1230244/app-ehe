import { registerSW } from 'virtual:pwa-register'

const updateInterval = 60 * 60 * 1000

registerSW({
  immediate: true,
  onRegisteredSW(_serviceWorkerUrl, registration) {
    if (!registration) return

    const checkForUpdate = () => {
      if (navigator.onLine) registration.update().catch(() => undefined)
    }

    checkForUpdate()
    window.addEventListener('focus', checkForUpdate)
    window.addEventListener('online', checkForUpdate)
    window.setInterval(checkForUpdate, updateInterval)
  }
})
