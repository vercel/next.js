export default class SameLoopPromise {
  constructor (cb) {
    this.onResultCallbacks = []
    this.onErrorCallbacks = []
    this.cb = cb
  }

  setResult (result) {
    this.gotResult = true
    this.result = result
    this.onResultCallbacks.forEach((cb) => cb(result))
    this.onResultCallbacks = []
  }

  setError (error) {
    this.gotError = true
    this.error = error
    this.onErrorCallbacks.forEach((cb) => cb(error))
    this.onErrorCallbacks = []
  }

  then (onResult, onError) {
    this.runIfNeeded()
    const promise = new SameLoopPromise()

    const handleError = () => {
      if (onError) {
        promise.setResult(onError(this.error))
      } else {
        promise.setError(this.error)
      }
    }

    const handleResult = () => {
      promise.setResult(onResult(this.result))
    }

    if (this.gotResult) {
      handleResult()
      return promise
    }

    if (this.gotError) {
      handleError()
      return promise
    }

    this.onResultCallbacks.push(handleResult)
    this.onErrorCallbacks.push(handleError)

    return promise
  }

  catch (onError) {
    this.runIfNeeded()
    const promise = new SameLoopPromise()

    const handleError = () => {
      promise.setResult(onError(this.error))
    }

    const handleResult = () => {
      promise.setResult(this.result)
    }

    if (this.gotResult) {
      handleResult()
      return promise
    }

    if (this.gotError) {
      handleError()
      return promise
    }

    this.onErrorCallbacks.push(handleError)
    this.onResultCallbacks.push(handleResult)

    return promise
  }

  runIfNeeded () {
    if (!this.cb) return
    if (this.ran) return

    this.ran = true
    this.cb(
      (result) => this.setResult(result),
      (error) => this.setError(error)
    )
  }
}
