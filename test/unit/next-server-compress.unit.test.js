import zlib from 'zlib'
import http from 'http'
import request from 'supertest'
import crypto from 'crypto'
import Compression from 'next/dist/next-server/server/compression'

describe('next-server compression', () => {
  it('should skip HEAD', () => {
    const server = createServer({ threshold: 0 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello, world')
    })

    return request(server)
      .head('/')
      .set('Accept-Encoding', 'gzip')
      .expect(shouldNotHaveHeader('Content-Encoding'))
      .expect(200)
  })

  it('should skip unknown accept-encoding', () => {
    const server = createServer({ threshold: 0 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello, world')
    })

    return request(server)
      .get('/')
      .set('Accept-Encoding', 'bogus')
      .expect(shouldNotHaveHeader('Content-Encoding'))
      .expect(200)
  })

  it('should skip if content-encoding already set', () => {
    const server = createServer({ threshold: 0 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.setHeader('Content-Encoding', 'x-custom')
      res.end('hello, world')
    })

    return request(server)
      .get('/')
      .set('Accept-Encoding', 'gzip')
      .expect('Content-Encoding', 'x-custom')
      .expect(200, 'hello, world')
  })

  it('should set Vary', () => {
    const server = createServer({ threshold: 0 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello, world')
    })

    return request(server)
      .get('/')
      .set('Accept-Encoding', 'br')
      .expect('Content-Encoding', 'br')
      .expect('Vary', 'Accept-Encoding')
  })

  it('should set Vary even if Accept-Encoding is not set', () => {
    const server = createServer({ threshold: 1000 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello, world')
    })

    return request(server)
      .get('/')
      .expect('Vary', 'Accept-Encoding')
      .expect(shouldNotHaveHeader('Content-Encoding'))
      .expect(200)
  })

  it('should not set Vary if Content-Type does not pass filter', () => {
    const server = createServer(undefined, (_req, res) => {
      res.setHeader('Content-Type', 'image/jpeg')
      res.end('hello, world')
    })

    return request(server)
      .get('/')
      .expect(shouldNotHaveHeader('Vary'))
      .expect(200)
  })

  it('should set Vary for HEAD request', () => {
    const server = createServer({ threshold: 0 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello, world')
    })

    return request(server)
      .head('/')
      .set('Accept-Encoding', 'gzip')
      .expect('Vary', 'Accept-Encoding')
  })

  it('should transfer chunked', () => {
    const server = createServer({ threshold: 0 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello, world')
    })

    return request(server)
      .get('/')
      .set('Accept-Encoding', 'br')
      .expect('Transfer-Encoding', 'chunked')
  })

  it('should remove Content-Length for chunked', () => {
    const server = createServer({ threshold: 0 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello, world')
    })

    return request(server)
      .get('/')
      .expect('Content-Encoding', 'gzip')
      .expect(shouldNotHaveHeader('Content-Length'))
      .expect(200)
  })

  it('should work with encoding arguments', () => {
    const server = createServer({ threshold: 0 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.write('hello, ', 'utf8')
      res.end('world', 'utf8')
    })

    return request(server)
      .get('/')
      .set('Accept-Encoding', 'gzip')
      .expect('Transfer-Encoding', 'chunked')
      .expect(200, 'hello, world')
  })

  it('should allow writing after close', () => {
    return new Promise((resolve) => {
      const server = createServer({ threshold: 0 }, (_req, res) => {
        res.setHeader('Content-Type', 'text/plain')
        res.once('close', function () {
          res.write('hello, ')
          res.end('world')
          resolve()
        })
        res.destroy()
      })

      request(server)
        .get('/')
        .end(() => {})
    })
  })

  it('should back-pressure when compressed', () => {
    return new Promise((resolve, reject) => {
      let buf
      let cb = after(2, resolve, reject)
      let client
      let drained = false
      let resp
      const server = createServer({ threshold: 0 }, (_req, res) => {
        resp = res

        res.on('drain', () => {
          drained = true
        })

        res.setHeader('Content-Type', 'text/plain')
        res.write('start')
        pressure()
      })

      crypto.randomBytes(1024 * 128, (err, chunk) => {
        expect(err).toBeFalsy()
        buf = chunk
        pressure()
      })

      function pressure() {
        if (!buf || !resp || !client) return

        expect(!drained).toBeTruthy()

        while (resp.write(buf) !== false) {
          resp.flush()
        }

        resp.on('drain', function () {
          expect(resp.write('end')).toBeTruthy()
          resp.end()
        })

        resp.on('finish', cb)
        client.resume()
      }

      request(server)
        .get('/')
        .request()
        .on('response', (res) => {
          client = res
          expect(res.headers['content-encoding']).toBe('gzip')
          res.pause()
          res.on('end', function () {
            server.close(cb)
          })
          pressure()
        })
        .end()
    })
  })

  it.skip('should back-pressure when uncompressed', () => {
    return new Promise((resolve, reject) => {
      let buf
      let cb = after(2, resolve, reject)
      let client
      let drained = false
      let resp
      const server = createServer(
        {
          filter: () => {
            return false
          },
        },
        (_req, res) => {
          resp = res

          res.on('drain', () => {
            drained = true
          })

          res.setHeader('Content-Type', 'text/plain')
          res.write('start')
          pressure()
        }
      )

      crypto.randomBytes(1024 * 128, (err, chunk) => {
        expect(err).toBeFalsy()
        buf = chunk
        pressure()
      })

      function pressure() {
        if (!buf || !resp || !client) return

        while (resp.write(buf) !== false) {
          resp.flush()
        }

        resp.on('drain', () => {
          expect(drained).toBeTruthy()
          expect(resp.write('end')).toBeTruthy()
          resp.end()
        })

        resp.on('finish', cb)
        client.resume()
      }

      request(server)
        .get('/')
        .request()
        .on('response', (res) => {
          client = res
          shouldNotHaveHeader('Content-Encoding')(res)
          res.pause()
          res.on('end', () => {
            server.close(cb)
          })
          pressure()
        })
        .end()
    })
  })

  it('should transfer large bodies', () => {
    const buf = Buffer.alloc(1000000, '.')
    const server = createServer({ threshold: 0 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end(buf)
    })

    return request(server)
      .get('/')
      .set('Accept-Encoding', 'gzip')
      .expect('Transfer-Encoding', 'chunked')
      .expect('Content-Encoding', 'gzip')
      .expect(shouldHaveBodyLength(1000000))
      .expect(200, buf.toString())
  })

  it('should transfer large bodies with multiple writes', () => {
    const len = 40000
    const buf = Buffer.alloc(len, '.')
    const server = createServer({ threshold: 0 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.write(buf)
      res.write(buf)
      res.write(buf)
      res.end(buf)
    })

    return request(server)
      .get('/')
      .set('Accept-Encoding', 'gzip')
      .expect('Transfer-Encoding', 'chunked')
      .expect('Content-Encoding', 'gzip')
      .expect(shouldHaveBodyLength(len * 4))
      .expect(200)
  })

  it('should compress when streaming without a content-length', () => {
    const server = createServer({ threshold: 1000 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.write('hello, ')
      setTimeout(() => {
        res.end('world')
      }, 10)
    })

    return request(server)
      .get('/')
      .set('Accept-Encoding', 'gzip')
      .expect('Content-Encoding', 'gzip')
  })

  it('should consider res.end() as 0 length', () => {
    const server = createServer({ threshold: 1 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end()
    })

    return request(server)
      .get('/')
      .set('Accept-Encoding', 'gzip')
      .expect(shouldNotHaveHeader('Content-Encoding'))
      .expect(200)
  })

  it('should return false writing after end', () => {
    const server = createServer({ threshold: 0 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello, world')
      expect(res.write(null)).toBeFalsy()
      expect(res.end()).toBeFalsy()
    })

    return request(server)
      .get('/')
      .set('Accept-Encoding', 'gzip')
      .expect('Content-Encoding', 'gzip')
  })

  it('flush should always be present', () => {
    const server = createServer(undefined, (_req, res) => {
      res.statusCode = typeof res.flush === 'function' ? 200 : 500
      res.flush()
      res.end()
    })

    return request(server).get('/').expect(200)
  })

  it('should not compress response when "Cache-Control: no-transform"', () => {
    const server = createServer({ threshold: 0 }, (_req, res) => {
      res.setHeader('Cache-Control', 'no-transform')
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello, world')
    })

    return request(server)
      .get('/')
      .set('Accept-Encoding', 'gzip')
      .expect('Cache-Control', 'no-transform')
      .expect(shouldNotHaveHeader('Content-Encoding'))
      .expect(200, 'hello, world')
  })

  it('when "Accept-Encoding: deflate"', () => {
    const server = createServer({ threshold: 0 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello, world')
    })

    return request(server)
      .get('/')
      .set('Accept-Encoding', 'deflate')
      .expect('Content-Encoding', 'deflate')
  })

  it('when "Accept-Encoding: deflate, gzip"', () => {
    const server = createServer({ threshold: 0 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello, world')
    })

    return request(server)
      .get('/')
      .set('Accept-Encoding', 'deflate, gzip')
      .expect('Content-Encoding', 'gzip')
  })

  it('req.flush should flush the response', () => {
    return new Promise((resolve, reject) => {
      let chunks = 0
      let next
      const server = createServer({ threshold: 0 }, (_req, res) => {
        next = writeAndFlush(res, 2, Buffer.alloc(1024))
        res.setHeader('Content-Type', 'text/plain')
        res.setHeader('Content-Length', '2048')
        next()
      })

      function onchunk(chunk) {
        expect(chunks++ < 2).toBeTruthy()
        expect(chunk.length).toBe(1024)
        next()
      }

      request(server)
        .get('/')
        .set('Accept-Encoding', 'gzip')
        .request()
        .on(
          'response',
          unchunk('gzip', onchunk, (err) => {
            if (err) return reject(err)
            server.close(resolve)
          })
        )
        .end()
    })
  })

  it('when "Accept-Encoding: deflate, gzip, br"', () => {
    const server = createServer({ threshold: 0 }, (_req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello, world')
    })

    return request(server)
      .get('/')
      .set('Accept-Encoding', 'gzip, deflate, br')
      .expect('Content-Encoding', 'br')
  })
})

function shouldHaveBodyLength(length) {
  return (res) => {
    if (res.text.length !== length) {
      throw Error(`req should have body length of: ${length}`)
    }
  }
}

function shouldNotHaveHeader(header) {
  return (res) => {
    if (header.toLowerCase() in res.headers) {
      throw Error(`req should not have header: ${header}`)
    }
  }
}

function createServer(opts, fn) {
  const _compression = Compression(opts)
  return http.createServer((req, res) => {
    _compression(req, res)
    fn(req, res)
  })
}

function after(count, callback, err_cb) {
  let bail = false
  proxy.count = count

  return count === 0 ? callback() : proxy

  function proxy(err, result) {
    if (proxy.count <= 0) {
      throw new Error('after called too many times')
    }
    --proxy.count

    // after first error, rest are passed to err_cb
    if (err) {
      bail = true
      callback(err)
      // future error callbacks will go to error handler
      callback = err_cb
    } else if (proxy.count === 0 && !bail) {
      callback(null, result)
    }
  }
}

function writeAndFlush(stream, count, buf) {
  var writes = 0

  return function () {
    if (writes++ >= count) return
    if (writes === count) return stream.end(buf)
    stream.write(buf)
    stream.flush()
  }
}

function unchunk(encoding, onchunk, onend) {
  return (res) => {
    var stream

    if (res.headers['content-encoding'] !== encoding) {
      throw new Error(`Content-Encoding header does not match`)
    }

    switch (encoding) {
      case 'deflate':
        stream = res.pipe(zlib.createInflate())
        break
      case 'gzip':
        stream = res.pipe(zlib.createGunzip())
        break
      case 'br':
        stream = res.pipe(zlib.createGunzip())
        break
      default:
        // do nothing
        break
    }

    stream.on('data', onchunk)
    stream.on('end', onend)
  }
}
