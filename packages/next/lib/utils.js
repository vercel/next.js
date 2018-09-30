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
  if (typeof Component === 'string') {
    return Component
  }

  return Component.displayName || Component.name || 'Unknown'
}

export function isResSent (res) {
  return res.finished || res.headersSent
}

export async function loadGetInitialProps (Component, ctx) {
  if (process.env.NODE_ENV !== 'production') {
    if (Component.prototype && Component.prototype.getInitialProps) {
      const compName = getDisplayName(Component)
      const message = `"${compName}.getInitialProps()" is defined as an instance method - visit https://err.sh/zeit/next.js/get-initial-props-as-an-instance-method for more information.`
      throw new Error(message)
    }
  }

  if (!Component.getInitialProps) return {}

  const props = await Component.getInitialProps(ctx)

  if (ctx.res && isResSent(ctx.res)) {
    return props
  }

  if (!props) {
    const compName = getDisplayName(Component)
    const message = `"${compName}.getInitialProps()" should resolve to an object. But found "${props}" instead.`
    throw new Error(message)
  }

  return props
}

export function getLocationOrigin () {
  const { protocol, hostname, port } = window.location
  return `${protocol}//${hostname}${port ? ':' + port : ''}`
}

export function getURL () {
  const { href } = window.location
  const origin = getLocationOrigin()
  return href.substring(origin.length)
}
