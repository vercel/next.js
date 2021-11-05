import Script from "next/script"

function Analytics({onLoad}) {
  function handleLoad() {
    const {ga} = window;

    ga('create', process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_UA, 'auto');
    ga('send', 'pageview');

    return onLoad({
      track: (name) => ga('send', name)
    })
  }

  return (
    <Script onLoad={handleLoad} strategy="afterInteractive" src="https://www.google-analytics.com/analytics.js" />
  )
}

export default Analytics