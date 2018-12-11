module.exports = {
  onDemandEntries: {
    maxInactiveAge: 1000 * 5
  },
  contentSecurityPolicy: "default-src 'none'; script-src 'self'; style-src 'nonce-{style-nonce}' 'unsafe-inline';connect-src 'self';img-src 'self';"
}
