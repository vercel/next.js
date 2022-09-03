/**
 * The runtime of the Turbopack dev server's HTML entry point.
 */
;(() => {
  let socket
  const chunksToSubscribe = []
  const chunkUpdateCallbacks = new Map()

  function subscribeToChunkUpdates(chunkId) {
    if (socket) {
      socket.send(JSON.stringify(chunkId))
    } else {
      chunksToSubscribe.push(chunkId)
    }
  }

  function onSocketConnected(connectedSocket) {
    socket = connectedSocket

    for (const chunkId of chunksToSubscribe) {
      socket.send(JSON.stringify(chunkId))
    }

    chunksToSubscribe.length = 0

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data)

      triggerChunkUpdate(data.type, data.id, data.instruction)
    }
  }

  function onChunkUpdate(chunkId, callback) {
    let callbacks = chunkUpdateCallbacks.get(chunkId)
    if (!callbacks) {
      callbacks = [callback]
      chunkUpdateCallbacks.set(chunkId, callbacks)
    } else {
      callbacks.push(callback)
    }

    subscribeToChunkUpdates(chunkId)
  }

  function triggerChunkUpdate(updateType, chunkId, instruction) {
    const callbacks = chunkUpdateCallbacks.get(chunkId)
    if (!callbacks) {
      return
    }

    try {
      for (const callback of callbacks) {
        callback(updateType, instruction)
      }
    } catch (err) {
      console.error(
        `An error occurred during the update of chunk \`${chunkId}\``,
        err,
      )
      location.reload()
    }
  }

  // Unlike ES chunks, CSS chunks cannot contain the logic to accept updates.
  // They must be reloaded here instead.
  function subscribeToInitialCssChunksUpdates() {
    const initialCssChunkLinks = document.head.querySelectorAll(
      'link[data-turbopack-chunk-id]',
    )
    for (const link of initialCssChunkLinks) {
      const chunkId = link.dataset.turbopackChunkId

      onChunkUpdate(chunkId, (updateType) => {
        switch (updateType) {
          case 'restart': {
            console.info(`Reloading CSS chunk \`${chunkId}\``)
            link.replaceWith(link)
            break
          }
          case 'partial':
            throw new Error(`partial CSS chunk updates are not supported`)
          default:
            throw new Error(`unknown update type \`${updateType}\``)
        }
      })
    }
  }

  if (typeof WebSocket !== 'undefined') {
    const connectingSocket = new WebSocket('ws' + location.origin.slice(4))

    connectingSocket.onopen = () => {
      onSocketConnected(connectingSocket)
    }
  }

  self.TURBOPACK_UPDATE_CLIENT = {
    onChunkUpdate,
  }

  subscribeToInitialCssChunksUpdates()
})()
