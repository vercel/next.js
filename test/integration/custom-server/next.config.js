module.exports = {
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60
  },
  generateEtags: process.env.GENERATE_ETAGS === 'true',
  contentSecurityPolicy: "default-src 'none'; script-src //127.0.0.1 'nonce-{script-nonce}' 'strict-dynamic' 'unsafe-inline' http: https:; style-src 'nonce-{style-nonce}' 'unsafe-inline';connect-src //127.0.0.1 'self';img-src //127.0.0.1 'self';"
}
