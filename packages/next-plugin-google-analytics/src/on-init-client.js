export default async function initClient({ router }) {
  router.events.on('routeChangeComplete', url => {
    setTimeout(() => {
      window.gtag('config', process.env.GA_TRACKING_ID, {
        page_location: url,
        page_title: document.title,
      })
    }, 0)
  })
}
