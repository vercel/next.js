import SockJS from 'sockjs-client'

let retries = 0
let sock = null

export default function socket (url, handlers) {
  sock = new SockJS(url)

  sock.onopen = () => {
    retries = 0
  }

  sock.onclose = () => {
    if (retries === 0) handlers.close()

    // Try to reconnect.
    sock = null

    // After 10 retries stop trying, to prevent logspam.
    if (retries <= 10) {
      // Exponentially increase timeout to reconnect.
      // Respectfully copied from the package `got`.
      const retryInMs = 1000 * Math.pow(2, retries) + Math.random() * 100
      retries += 1

      setTimeout(() => {
        socket(url, handlers)
      }, retryInMs)
    }
  }

  sock.onmessage = (e) => {
    // This assumes that all data sent via the websocket is JSON.
    const msg = JSON.parse(e.data)
    if (handlers[msg.type]) {
      handlers[msg.type](msg.data)
    }
  }
}
