const { Initializer, api } = require('actionhero')
const next = require('next')

module.exports = class NextInitializer extends Initializer {
  constructor() {
    super()
    this.name = 'next'
  }

  async initialize() {
    api.next = {
      render: async (connection) => {
        if (connection.type !== 'web') {
          throw new Error('Connections for NEXT apps must be of type "web"')
        }
        const req = connection.rawConnection.req
        const res = connection.rawConnection.res
        return api.next.handle(req, res)
      },
    }

    api.next.dev = api.env === 'development'
    if (api.next.dev) {
      api.log('Running next in development mode...')
    }

    api.next.app = next({ dev: api.next.dev })
    api.next.handle = api.next.app.getRequestHandler()
    await api.next.app.prepare()
  }

  async stop() {
    await api.next.app.close()
  }
}
