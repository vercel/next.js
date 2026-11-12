// Based on assertion-error 2.0.1. See LICENSE.

const canElideFrames = 'captureStackTrace' in Error
const defineProperty = Object.defineProperty

export class AssertionError extends Error {
  get name() {
    return 'AssertionError'
  }

  get ok() {
    return false
  }

  constructor(message = 'Unspecified AssertionError', props, ssf) {
    super(message)
    // Define the public field explicitly: native Error class-field transitions
    // can otherwise revert message to a nonenumerable property on Node 20.
    defineProperty(this, 'message', {
      value: message,
      enumerable: true,
      configurable: true,
      writable: true,
    })
    if (canElideFrames) {
      Error.captureStackTrace(this, ssf || AssertionError)
    }
    for (const key in props) {
      if (!(key in this)) {
        this[key] = props[key]
      }
    }
  }

  toJSON(stack) {
    return {
      ...this,
      name: this.name,
      message: this.message,
      ok: false,
      // Include stack if it exists and has not been turned off.
      stack: stack !== false ? this.stack : undefined,
    }
  }
}

export class AssertionResult {
  get name() {
    return 'AssertionResult'
  }

  get ok() {
    return true
  }

  constructor(props) {
    for (const key in props) {
      if (!(key in this)) {
        this[key] = props[key]
      }
    }
  }

  toJSON() {
    return {
      ...this,
      name: this.name,
      ok: this.ok,
    }
  }
}
