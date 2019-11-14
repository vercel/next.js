// Note that to use the websocket server, you also need the web server enabled

exports['default'] = {
  servers: {
    websocket: api => {
      return {
        enabled: true,
        // you can pass a FQDN (string) here or 'window.location.origin'
        clientUrl: 'window.location.origin',
        // Directory to render client-side JS.
        // Path should start with "/" and will be built starting from api.config..general.paths.public
        clientJsPath: 'javascript/',
        // the name of the client-side JS file to render.  Both `.js` and `.min.js` versions will be created
        // do not include the file exension
        // set to `undefined` to not render the client-side JS on boot
        clientJsName: 'ActionheroWebsocketClient',
        // should the server signal clients to not reconnect when the server is shutdown/reboot
        destroyClientsOnShutdown: false,

        // websocket Server Options:
        server: {
          // authorization: null,
          // pathname:      '/primus',
          // parser:        'JSON',
          // transformer:   'websockets',
          // plugin:        {},
          // timeout:       35000,
          // origins:       '*',
          // methods:       ['GET','HEAD','PUT','POST','DELETE','OPTIONS'],
          // credentials:   true,
          // maxAge:        '30 days',
          // exposed:       false,
        },

        // websocket Client Options:
        client: {
          apiPath: '/api', // the api base endpoint on your actionhero server
          // reconnect:        {},
          // timeout:          10000,
          // ping:             25000,
          // pong:             10000,
          // strategy:         "online",
          // manual:           false,
          // websockets:       true,
          // network:          true,
          // transport:        {},
          // queueSize:        Infinity,
        },
      }
    },
  },
}

exports['test'] = {
  servers: {
    websocket: api => {
      return { clientUrl: null }
    },
  },
}
