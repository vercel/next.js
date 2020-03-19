import App from 'next/app'
import Router from 'next/router'
import audit from '@indent/audit'

audit.init({
  // Find your DSN on Indent Docs https://indent.com/docs/quickstart
  dsn: '{{INDENT_INPUT_DSN}}',
})

const pageview = url =>
  audit.write({
    event: 'page_viewed',
    resources: [
      {
        kind: 'http/url',
        id: url,
      },
    ],
  })

if (typeof window !== 'undefined') {
  pageview(window.location.href)
}

Router.events.on('routeChangeComplete', url => pageview(url))

export default App
