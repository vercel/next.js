import('remoteApp').then(
  (remote) => {
    document.getElementById('webpack-host-status').textContent =
      remote.rootMarker
  },
  (error) => {
    document.getElementById('webpack-host-status').textContent =
      `error: ${error.message}`
  }
)
