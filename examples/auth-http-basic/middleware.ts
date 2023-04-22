import basicAuth from './lib/basicAuth'

// Note: This is an example. In a production environment you will likely want to get your
// credentials from a more secure source, as well as compare hashes rather than plaintext.
export const middleware = basicAuth.createMiddleware((credentials) => {
  if (!process.env.HTTP_BASIC_AUTH_USER || !process.env.HTTP_BASIC_AUTH_PASS) {
    return false
  }

  return (
    credentials.username === process.env.HTTP_BASIC_AUTH_USER &&
    credentials.password === process.env.HTTP_BASIC_AUTH_PASS
  )
})
