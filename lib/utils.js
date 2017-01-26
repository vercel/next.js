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

export async function loadGetInitialProps (Component, ctx) {
  if (!Component.getInitialProps) return {}

  const props = await Component.getInitialProps(ctx)
  if (!props && (!ctx.res || !ctx.res.finished)) {
    const compName = Component.displayName || Component.name
    const message = `"${compName}.getInitialProps()" should resolve to an object. But found "${props}" instead.`
    throw new Error(message)
  }
  return props
}
