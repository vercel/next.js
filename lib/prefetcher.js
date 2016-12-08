async function register () {
  if (!navigator.serviceWorker) return
  await navigator.serviceWorker.register('/_next-prefetcher.js')
  console.log('Service Worker successfully registered')
}

// Only runs in the client.
if (typeof document !== 'undefined') {
  // We need to register the service worker, only after all the other resources
  // of the page has loaded.
  // This is because, we don't need to prefetch before loading all the assets
  // for the current page.
  if (document.readyState === 'complete') {
    register()
  } else {
    window.addEventListener('load', register)
  }
}
