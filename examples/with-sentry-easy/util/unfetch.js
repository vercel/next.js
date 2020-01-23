import fetch from 'isomorphic-unfetch'
import * as Sentry from '@sentry/node'
import FetchError from './FetchError'

function dealStatus(res) {
  if (res.status !== 200) {
    const err = new FetchError(res.url, {
      traceId: Math.random() * 10000, // create your application traceId
      userId: 26,
      message: `${
        typeof window !== 'undefined' ? 'Client' : 'Server'
      } fetch error: ${res.status}`,
    })
    // This will work on both client and server sides in production.
    Sentry.captureException(err)
  }
  return res
}

// initial fetch
const unfetch = Object.create(null)

// ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH', 'PUT']
const HTTP_METHOD = ['get', 'post', 'put', 'patch', 'delete']

// can send data method
const BODY_METHOD = ['post', 'put', 'delete', 'patch']

HTTP_METHOD.forEach(method => {
  // is can send data in opt.body
  const bodyData = BODY_METHOD.includes(method)
  unfetch[method] = (path, { data } = {}) => {
    let url = path
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      mode: 'cors',
      cache: 'no-cache',
    }

    if (bodyData && data) {
      opts.body = JSON.stringify(data)
    }

    console.info('Request Url:', url)

    return fetch(url, opts)
      .then(dealStatus)
      .then(res => res.json())
  }
})

export default unfetch
