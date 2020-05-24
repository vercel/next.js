exports['default'] = {
  servers: {
    socket: api => {
      return {
        enabled: process.env.ENABLE_TCP_SERVER !== undefined,
        // TCP or TLS?
        secure: false,
        // Passed to tls.createServer if secure=true. Should contain SSL certificates
        serverOptions: {},
        // Port or Socket
        port: 5000,
        // Which IP to listen on (use 0.0.0.0 for all)
        bindIP: '0.0.0.0',
        // Enable TCP KeepAlive pings on each connection?
        setKeepAlive: false,
        // Delimiter string for incoming messages
        delimiter: '\n',
        // Maximum incoming message string length in Bytes (use 0 for Infinite)
        maxDataLength: 0,
      }
    },
  },
}

exports.test = {
  servers: {
    socket: api => {
      return {
        enabled: true,
        port: 1001 + (process.pid % 64535),
        secure: false,
      }
    },
  },
}
