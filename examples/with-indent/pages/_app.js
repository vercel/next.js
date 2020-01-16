import App from 'next/app'
import Router from 'next/router'
import * as indent from '../lib/indent'

indent.register({
  space: '',
  provider: '',
  input: ''
})

if (typeof window !== 'undefined') {
  if (window.localStorage['$viewer.email']) {
    indent.setActor({ email: window.localStorage['$viewer.email'] })
  }

  indent.pageview(window.location.href)
}

Router.events.on('routeChangeComplete', url => indent.pageview(url))

export default App
