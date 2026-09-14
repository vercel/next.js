self.onmessage = (event: MessageEvent<string>) => {
  self.postMessage(`pong: ${event.data}`)
}

export {}
