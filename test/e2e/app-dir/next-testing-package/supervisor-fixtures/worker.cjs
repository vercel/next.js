process.send?.({ ready: true })
// Ignore cooperative termination to exercise the outer verifier's SIGKILL path.
process.on('SIGTERM', () => {})
setInterval(() => {}, 1000)
