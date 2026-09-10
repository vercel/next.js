export class ImageError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)

    // ensure an error status is used > 400
    if (statusCode >= 400) {
      this.statusCode = statusCode
    } else {
      this.statusCode = 500
    }
  }
}
