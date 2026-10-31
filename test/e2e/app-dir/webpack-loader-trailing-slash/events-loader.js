// Like glslify-deps, require the npm package rather than Node's built-in events.
const { EventEmitter } = require('events/')

module.exports = function (source) {
  const emitter = new EventEmitter()
  let message
  emitter.on('message', (value) => {
    message = value
  })
  emitter.emit('message', source.trim())
  return `export default ${JSON.stringify(message)}`
}
