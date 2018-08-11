export function warn (message) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(message)
  }
}

export function execOnce (fn) {
  let used = false
  return (...args) => {
    if (!used) {
      used = true
      fn.apply(this, args)
    }
  }
}

export function getDisplayName (Component) {
  return Component.displayName || Component.name || 'Unknown'
}

export function getURL () {
  const { href, protocol, hostname, port } = window.location
  const origin = `${protocol}//${hostname}${port ? ':' + port : ''}`
  return href.substring(origin.length)
}
