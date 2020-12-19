/**
 * Mock Service Worker.
 * @see https://github.com/mswjs/msw
 * - Please do NOT modify this file.
 * - Please do NOT serve this file on production.
 */
/* eslint-disable */
/* tslint:disable */

const INTEGRITY_CHECKSUM = '65d33ca82955e1c5928aed19d1bdf3f9'
const bypassHeaderName = 'x-msw-bypass'

let clients = {}

self.addEventListener('install', function () {
  return self.skipWaiting()
})

self.addEventListener('activate', async function (event) {
  return self.clients.claim()
})

self.addEventListener('message', async function (event) {
  const clientId = event.source.id
  const client = await event.currentTarget.clients.get(clientId)
  const allClients = await self.clients.matchAll()
  const allClientIds = allClients.map((client) => client.id)

  switch (event.data) {
    case 'KEEPALIVE_REQUEST': {
      sendToClient(client, {
        type: 'KEEPALIVE_RESPONSE',
      })
      break
    }

    case 'INTEGRITY_CHECK_REQUEST': {
      sendToClient(client, {
        type: 'INTEGRITY_CHECK_RESPONSE',
        payload: INTEGRITY_CHECKSUM,
      })
      break
    }

    case 'MOCK_ACTIVATE': {
      clients = ensureKeys(allClientIds, clients)
      clients[clientId] = true

      sendToClient(client, {
        type: 'MOCKING_ENABLED',
        payload: true,
      })
      break
    }

    case 'MOCK_DEACTIVATE': {
      clients = ensureKeys(allClientIds, clients)
      clients[clientId] = false
      break
    }

    case 'CLIENT_CLOSED': {
      const remainingClients = allClients.filter((client) => {
        return client.id !== clientId
      })

      // Unregister itself when there are no more clients
      if (remainingClients.length === 0) {
        self.registration.unregister()
      }

      break
    }
  }
})

self.addEventListener('fetch', function (event) {
  const { clientId, request } = event
  const requestClone = request.clone()
  const getOriginalResponse = () => fetch(requestClone)

  // Bypass navigation requests.
  if (request.mode === 'navigate') {
    return
  }

  // Bypass mocking if the current client isn't present in the internal clients map
  // (i.e. has the mocking disabled).
  if (!clients[clientId]) {
    return
  }

  // Opening the DevTools triggers the "only-if-cached" request
  // that cannot be handled by the worker. Bypass such requests.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
    return
  }

  event.respondWith(
    new Promise(async (resolve, reject) => {
      const client = await event.target.clients.get(clientId)

      // Bypass mocking when the request client is not active.
      if (!client) {
        return resolve(getOriginalResponse())
      }

      // Bypass requests with the explicit bypass header
      if (requestClone.headers.get(bypassHeaderName) === 'true') {
        const modifiedHeaders = serializeHeaders(requestClone.headers)

        // Remove the bypass header to comply with the CORS preflight check
        delete modifiedHeaders[bypassHeaderName]

        const originalRequest = new Request(requestClone, {
          headers: new Headers(modifiedHeaders),
        })

        return resolve(fetch(originalRequest))
      }

      const reqHeaders = serializeHeaders(request.headers)
      const body = await request.text()

      const rawClientMessage = await sendToClient(client, {
        type: 'REQUEST',
        payload: {
          url: request.url,
          method: request.method,
          headers: reqHeaders,
          cache: request.cache,
          mode: request.mode,
          credentials: request.credentials,
          destination: request.destination,
          integrity: request.integrity,
          redirect: request.redirect,
          referrer: request.referrer,
          referrerPolicy: request.referrerPolicy,
          body,
          bodyUsed: request.bodyUsed,
          keepalive: request.keepalive,
        },
      })

      const clientMessage = rawClientMessage

      switch (clientMessage.type) {
        case 'MOCK_SUCCESS': {
          setTimeout(
            resolve.bind(this, createResponse(clientMessage)),
            clientMessage.payload.delay,
          )
          break
        }

        case 'MOCK_NOT_FOUND': {
          return resolve(getOriginalResponse())
        }

        case 'NETWORK_ERROR': {
          const { name, message } = clientMessage.payload
          const networkError = new Error(message)
          networkError.name = name

          // Rejecting a request Promise emulates a network error.
          return reject(networkError)
        }

        case 'INTERNAL_ERROR': {
          const parsedBody = JSON.parse(clientMessage.payload.body)

          console.error(
            `\
[MSW] Request handler function for "%s %s" has thrown the following exception:

${parsedBody.errorType}: ${parsedBody.message}
(see more detailed error stack trace in the mocked response body)

This exception has been gracefully handled as a 500 response, however, it's strongly recommended to resolve this error.
If you wish to mock an error response, please refer to this guide: https://mswjs.io/docs/recipes/mocking-error-responses\
  `,
            request.method,
            request.url,
          )

          return resolve(createResponse(clientMessage))
        }
      }
    }).catch((error) => {
      console.error(
        '[MSW] Failed to mock a "%s" request to "%s": %s',
        request.method,
        request.url,
        error,
      )
    }),
  )
})

function serializeHeaders(headers) {
  const reqHeaders = {}
  headers.forEach((value, name) => {
    reqHeaders[name] = reqHeaders[name]
      ? [].concat(reqHeaders[name]).concat(value)
      : value
  })
  return reqHeaders
}

function sendToClient(client, message) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()

    channel.port1.onmessage = (event) => {
      if (event.data && event.data.error) {
        reject(event.data.error)
      } else {
        resolve(event.data)
      }
    }

    client.postMessage(JSON.stringify(message), [channel.port2])
  })
}

function createResponse(clientMessage) {
  return new Response(clientMessage.payload.body, {
    ...clientMessage.payload,
    headers: clientMessage.payload.headers,
  })
}

function ensureKeys(keys, obj) {
  return Object.keys(obj).reduce((acc, key) => {
    if (keys.includes(key)) {
      acc[key] = obj[key]
    }

    return acc
  }, {})
}
