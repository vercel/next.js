class CustomError {
  constructor(message, data) {
    this.message = message
    this.data = data
  }
  toString() {
    return this.message
  }
}

export default () => {
  throw new CustomError('custom error message', {})
}
