describe('node environment WebSocket global', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'WebSocket'
  )

  const restoreWebSocket = () => {
    delete (globalThis as any).WebSocket
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'WebSocket', originalDescriptor)
    }
  }

  afterEach(() => {
    restoreWebSocket()
    jest.resetModules()
  })

  afterAll(restoreWebSocket)

  it('lazily installs the vendored implementation and permits an override', () => {
    delete (globalThis as any).WebSocket

    jest.isolateModules(() => {
      require('next/dist/server/node-environment-baseline')

      const lazyDescriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        'WebSocket'
      )
      expect(typeof lazyDescriptor?.get).toBe('function')
      expect(globalThis.WebSocket).toBe(
        require('next/dist/compiled/ws').WebSocket
      )

      class UserWebSocket {}
      ;(globalThis as any).WebSocket = UserWebSocket
      expect(globalThis.WebSocket).toBe(UserWebSocket)
      expect(
        Object.getOwnPropertyDescriptor(globalThis, 'WebSocket')?.get
      ).toBeUndefined()
    })
  })

  it('preserves an existing user WebSocket implementation', () => {
    class UserWebSocket {}
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: UserWebSocket,
    })

    jest.isolateModules(() => {
      require('next/dist/server/node-environment-baseline')
      expect(globalThis.WebSocket).toBe(UserWebSocket)
    })
  })
})
