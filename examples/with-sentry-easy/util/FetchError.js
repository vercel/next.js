class FetchError extends Error {
  constructor(url = 'http://localhost', props) {
    super(props)
    const { message, traceId, userId } = props

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FetchError)
    }

    this.name = 'FetchError'
    // Custom debugging information
    this.url = url
    this.message = message
    traceId && (this.traceId = traceId)
    userId && (this.userId = userId)
    this.date = new Date()
  }
}

export default FetchError
