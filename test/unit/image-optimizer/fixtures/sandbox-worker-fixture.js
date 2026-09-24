const fs = require('fs')
const net = require('net')

function result(message, diagnostics = []) {
  process.send({
    type: 'result',
    id: message.id,
    value: {
      result: {
        buffer: message.operation.imageUpstream.buffer,
        contentType: 'image/png',
        maxAge: 60,
        etag: 'result',
        upstreamEtag: message.operation.imageUpstream.etag,
      },
      diagnostics,
    },
  })
}

process.on('message', (message) => {
  const url = new URL(message.operation.params.href, 'http://n')
  switch (url.pathname) {
    case '/echo':
      result(message)
      return
    case '/delay':
      setTimeout(() => result(message), Number(url.searchParams.get('ms')))
      return
    case '/crash':
      process.exit(23)
      return
    case '/hang':
      return
    case '/ignore-term':
      process.on('SIGTERM', () => {})
      result(message)
      return
    case '/malformed':
      process.send({ type: 'result', id: message.id })
      return
    case '/invalid-buffer':
      process.send({
        type: 'result',
        id: message.id,
        value: { result: { buffer: {} }, diagnostics: [] },
      })
      return
    case '/error':
      process.send({
        type: 'error',
        id: message.id,
        error: {
          name: 'ImageError',
          message: 'fixture transform failed',
          statusCode: 422,
          code: 'FIXTURE_ERROR',
        },
      })
      return
    case '/read': {
      try {
        fs.readFileSync(url.searchParams.get('path'))
        result(message, [{ level: 'warn-once', message: 'read-allowed' }])
      } catch (error) {
        result(message, [
          { level: 'warn-once', message: `read-blocked:${error.code}` },
        ])
      }
      return
    }
    case '/write': {
      try {
        fs.writeFileSync(url.searchParams.get('path'), 'sandbox escape')
        result(message, [{ level: 'warn-once', message: 'write-allowed' }])
      } catch (error) {
        result(message, [
          { level: 'warn-once', message: `write-blocked:${error.code}` },
        ])
      }
      return
    }
    case '/network': {
      const socket = net.connect(
        Number(url.searchParams.get('port')),
        '127.0.0.1'
      )
      const timeout = setTimeout(() => {
        socket.destroy()
        result(message, [
          { level: 'warn-once', message: 'network-blocked:timeout' },
        ])
      }, 500)
      socket.once('connect', () => {
        clearTimeout(timeout)
        socket.destroy()
        result(message, [{ level: 'warn-once', message: 'network-allowed' }])
      })
      socket.once('error', (error) => {
        clearTimeout(timeout)
        result(message, [
          { level: 'warn-once', message: `network-blocked:${error.code}` },
        ])
      })
      return
    }
    case '/env':
      result(message, [
        {
          level: 'warn-once',
          message: process.env[url.searchParams.get('name')]
            ? 'env-visible'
            : 'env-blocked',
        },
      ])
      return
    default:
      throw new Error(`Unknown fixture operation: ${url.pathname}`)
  }
})

process.on('disconnect', () => process.exit(0))
