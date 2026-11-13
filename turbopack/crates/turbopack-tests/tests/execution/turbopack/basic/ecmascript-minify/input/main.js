const inlined = 3
const message = getMessage()

export const logs = []
const log = (...args) => logs.push(args)

log('Hello,' + ' world!', inlined, message)
log(message)

function getMessage() {
  return 'Hello'
}
