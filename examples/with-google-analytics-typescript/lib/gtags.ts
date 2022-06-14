const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_ID ?? ''

// measure PV
const pageview = (url: string): void => {
  if (GA_TRACKING_ID === '') return

  window.gtag('config', GA_TRACKING_ID, {
    page_path: url,
  })
}

export { GA_TRACKING_ID, pageview }
