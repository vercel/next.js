export default async function initClient({ router }) {
  router.events.on('routeChangeComplete', (url) => {
    setTimeout(() => {
      window.gtag('config', process.env.NEXT_PUBLIC_GA_TRACKING_ID, {
        page_location: url,
        page_title: document.title,
      })
    }, 0)
  })
}
