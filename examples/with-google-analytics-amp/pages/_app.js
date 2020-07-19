import App from 'next/app'
import Router from 'next/router'

import * as gtag from '../lib/gtag'

Router.events.on('routeChangeComplete', () => gtag.pageview())

export default App
