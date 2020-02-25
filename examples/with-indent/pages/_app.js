import App from 'next/app'
import Router from 'next/router'
import { audit } from '@indent/node'

audit.init({
  debug: true,
  dsn: 'https://replaceme.com'
})

const pageview = url =>
  audit.write({
    event: 'page_viewed',
    resources: [
      {
        kind: 'http/url',
        id: url
      }
    ]
  })

if (typeof window !== 'undefined') {
  pageview(window.location.href)
}

Router.events.on('routeChangeComplete', url => pageview(url))

export default App
