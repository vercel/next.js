export function warn (message) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(message)
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
