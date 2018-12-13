module.exports = {
  contentSecurityPolicy: "default-src 'none'; script-src 'nonce-{script-nonce}' 'strict-dynamic' 'unsafe-inline' http: https:; style-src 'nonce-{style-nonce}' 'unsafe-inline';connect-src 'self';img-src 'self';",
  crossOrigin: 'anonymous'
}
