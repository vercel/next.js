import http from 'http'
import { NextInstance, createNextDescribe } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

// Taken from https://github.com/whatwg/fetch/issues/551#issuecomment-655848415
// Use this method instead of fetchViaHTTP for make a GET/HEAD request with body
// fetchViaHTTP(node fetch) throw a Error if a GET/HEAD request has a body
const requestWithBody = (
  next: NextInstance,
  body: string,
  options: http.RequestOptions
) => {
  return new Promise<{
    statusCode: number
    data: any
  }>((resolve, reject) => {
    const callback = function (response: http.IncomingMessage) {
      let str = ''

      response.on('data', function (chunk) {
        str += chunk
      })

      response.on('end', function () {
        let data: object
        try {
          data = JSON.parse(str)
        } catch (error) {
          data = {}
        }
        resolve({
          statusCode: response.statusCode,
          data,
        })
      })
    }

    const req = http.request(options, callback)
    req.on('error', (e) => {
      reject(e)
    })
    req.write(body)
    req.end()
  })
}

createNextDescribe(
  'api-endoint-with-body-in-get-head-method',
  {
    files: __dirname,
  },
  ({ next }) => {
    //First check a normal requests working succesfully
    it('GET Request without body', async () => {
      const res = await fetchViaHTTP(next.appPort, '/api/hello')

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        msg: 'hello',
      })
    })
    it('HEAD Request without body', async () => {
      const res = await fetchViaHTTP(
        next.appPort,
        '/api/hello',
        {},
        {
          method: 'HEAD',
        }
      )
      expect(res.status).toBe(200)
    })

    //Then check requests whith body, the key of these test is in the conent-length
    //the Error 'UND_ERR_REQ_CONTENT_LENGTH_MISMATCH'
    it('GET Request with body', async () => {
      const body = JSON.stringify({ a: 1 })
      const options = {
        host: 'localhost',
        port: next.appPort,
        protocol: 'http:',
        path: '/api/hello',
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          'content-length': body.length,
        },
      }
      await expect(requestWithBody(next, body, options)).resolves.toEqual({
        statusCode: 200,
        data: { msg: 'hello' },
      })
    })

    it('HEAD Request with body', async () => {
      const body = JSON.stringify({ a: 1 })
      const options = {
        host: 'localhost',
        port: next.appPort,
        protocol: 'http:',
        path: '/api/hello',
        method: 'HEAD',
        headers: {
          'content-type': 'application/json',
          'content-length': body.length,
        },
      }
      await expect(requestWithBody(next, body, options)).resolves.toEqual({
        statusCode: 200,
        data: {},
      })
    })
  }
)
