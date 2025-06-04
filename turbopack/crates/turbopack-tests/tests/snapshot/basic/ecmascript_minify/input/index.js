const inlined = 3
const message = getMessage()

console.log('Hello,' + ' world!', inlined, message)
console.log(message)

function getMessage() {
  return 'Hello'
}
