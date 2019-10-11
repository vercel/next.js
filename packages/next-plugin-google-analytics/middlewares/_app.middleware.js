export async function clientInit ({ router }) {
  console.log('Google Analytics _app middleware called')

  router.events.on('routeChangeComplete', url => {
    console.log('route change!', url)
  })
}
