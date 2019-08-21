import fetch from 'isomorphic-unfetch'
import { ROOT_URL } from './configs'

export default function fetchApi (req, path, fetchOptions = {}) {
  const url = ROOT_URL + path

  // In SSR the `credentials` option does nothing, that's only useful in the browser
  // so instead we send the auth cookies manually
  if (typeof window === 'undefined') {
    const options = {
      ...fetchOptions,
      headers: {
        ...fetchOptions.headers,
        // Because this method only allows requests to the same domain (ROOT_URL), it's safe
        // to send the same cookies, but you could manually send only the auth cookies too
        cookie: req.headers.cookie
      }
    }
    return fetch(url, options)
  }

  return fetch(url, {
    ...fetchOptions,
    credentials: 'same-origin'
  })
}
