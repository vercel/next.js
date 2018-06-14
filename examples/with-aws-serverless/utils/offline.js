/**
 * https://github.com/GoogleChrome/sw-precache/blob/master/demo/app/js/service-worker-registration.js
 */

if (
    process.env.NODE_ENV === 'production' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator
) {
    navigator.serviceWorker
        .register('/sw.js')
        .then(function() {
            console.log('Service worker registered')
        })
        .catch(function(e) {
            console.error('Error during service worker registration:', e)
        })
}