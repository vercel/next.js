function readCurrentTime() {
  return new Date().toISOString()
}

function BlockingWidget() {
  return readCurrentTime()
}

function TimestampWidget() {
  return Date.now()
}

function RandomWidget() {
  return Math.random()
}

function WebCryptoWidget() {
  return crypto.getRandomValues(new Uint8Array(1))[0]
}

function NodeCryptoWidget() {
  return require('node:crypto').randomUUID()
}

module.exports = {
  BlockingWidget,
  TimestampWidget,
  RandomWidget,
  WebCryptoWidget,
  NodeCryptoWidget,
}
