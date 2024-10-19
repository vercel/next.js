export class ConsoleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConsoleError'
  }
}
