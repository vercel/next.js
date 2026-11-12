function isErrorInstance(obj) {
  return (
    obj instanceof Error ||
    Object.prototype.toString.call(obj) === '[object Error]'
  )
}

function isRegExp(obj) {
  return Object.prototype.toString.call(obj) === '[object RegExp]'
}

function compatibleInstance(thrown, errorLike) {
  return isErrorInstance(errorLike) && thrown === errorLike
}

function compatibleConstructor(thrown, errorLike) {
  if (isErrorInstance(errorLike)) {
    // If `errorLike` is an instance of any error we compare their constructors
    return (
      thrown.constructor === errorLike.constructor ||
      thrown instanceof errorLike.constructor
    )
  } else if (
    (typeof errorLike === 'object' || typeof errorLike === 'function') &&
    errorLike.prototype
  ) {
    // If `errorLike` is a constructor that inherits from Error, we compare `thrown` to `errorLike` directly
    return thrown.constructor === errorLike || thrown instanceof errorLike
  }

  return false
}

function compatibleMessage(thrown, errMatcher) {
  const comparisonString = typeof thrown === 'string' ? thrown : thrown.message
  if (comparisonString === undefined) {
    return false
  }
  if (isRegExp(errMatcher)) {
    return errMatcher.test(comparisonString)
  } else if (typeof errMatcher === 'string') {
    return comparisonString.indexOf(errMatcher) !== -1
  }

  return false
}

function getConstructorName(errorLike) {
  let constructorName = errorLike
  if (isErrorInstance(errorLike)) {
    constructorName = errorLike.constructor.name
  } else if (typeof errorLike === 'function') {
    // If `err` is not an instance of Error it is an error constructor itself or another function.
    // If we've got a common function we get its name, otherwise we may need to create a new instance
    // of the error just in case it's a poorly-constructed error. Please see chaijs/chai/issues/45 to know more.
    constructorName = errorLike.name
    if (constructorName === '') {
      const newConstructorName = new errorLike().name
      constructorName = newConstructorName || constructorName
    }
  }

  return constructorName
}

function getMessage(errorLike) {
  let msg = ''
  if (errorLike && errorLike.message) {
    msg = errorLike.message
  } else if (typeof errorLike === 'string') {
    msg = errorLike
  }

  return msg
}

export {
  compatibleInstance,
  compatibleConstructor,
  compatibleMessage,
  getMessage,
  getConstructorName,
}
