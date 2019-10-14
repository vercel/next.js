export default async function initClient ({ router }) {
  console.log('Google Analytics _app middleware called')
  // for testing
  window.didClientInit = true

  router.events.on('routeChangeComplete', url => {
    console.log('route change!', url)
  })
}
