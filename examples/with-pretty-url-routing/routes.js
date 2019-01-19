const UrlPrettifier = require('next-url-prettifier').default

const routes = [
  {
    page: 'index',
    prettyUrl: '/home'
  },
  {
    page: 'greeting',
    prettyUrl: ({ lang = '', name = '' }) =>
      lang === 'fr' ? `/bonjour/${name}` : `/hello/${name}`,
    prettyUrlPatterns: [
      { pattern: '/hello/:name', defaultParams: { lang: 'en' } },
      { pattern: '/bonjour/:name', defaultParams: { lang: 'fr' } }
    ]
  }
]

const urlPrettifier = new UrlPrettifier(routes)
exports.default = routes
exports.Router = urlPrettifier
