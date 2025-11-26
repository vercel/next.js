declare global {
  var _testState: {
    initialized: boolean
    reload: boolean | Promise<void>
  }
}

if (!globalThis._testState) {
  globalThis._testState = {
    initialized: false,
    reload: false,
  }
}

export const subscribeToHMR = async () => {
  const state = globalThis._testState

  if (state.initialized) {
    if (state.reload === true) {
      let resolve: () => void
      state.reload = new Promise<void>((res) => (resolve = res))
      await new Promise((resolve) => setTimeout(resolve, 200))
      resolve()
    }

    if (state.reload instanceof Promise) {
      await state.reload
    }

    return
  }

  state.initialized = true

  const ws = new WebSocket(
    `ws://localhost:${process.env.PORT}/_next/webpack-hmr`
  )

  ws.onmessage = (event: any) => {
    if (typeof event.data === 'string') {
      const data = JSON.parse(event.data)
      if (data.type === 'serverComponentChanges') {
        state.reload = true
      }
    }
  }
}
