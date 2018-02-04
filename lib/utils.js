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

export function deprecated (fn, message) {
  if (process.env.NODE_ENV === 'production') return fn

  let warned = false
  const newFn = function (...args) {
    if (!warned) {
      warned = true
      console.error(message)
    }
    return fn.apply(this, args)
  }

  // copy all properties
  Object.assign(newFn, fn)

  return newFn
}

export function printAndExit (message, code = 1) {
  if (code === 0) {
    console.log(message)
  } else {
    console.error(message)
  }

  process.exit(code)
}

export function getDisplayName (Component) {
  return Component.displayName || Component.name || 'Unknown'
}

export function isResSent (res) {
  return res.finished || res.headersSent
}

export async function loadGetInitialProps (Component, ctx) {
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
