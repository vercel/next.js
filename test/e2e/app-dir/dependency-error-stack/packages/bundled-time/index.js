function readCurrentTime() {
  return new Date().toISOString()
}

function BlockingWidget() {
  return readCurrentTime()
}

module.exports = { BlockingWidget }
