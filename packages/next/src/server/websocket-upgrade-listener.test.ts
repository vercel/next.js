import { PassThrough } from 'node:stream'
import { armUnclaimedUpgradeSocketTimeout } from './websocket-upgrade-listener'
import { PENDING_UPGRADE_IDLE_TIMEOUT_MS } from './websocket-shutdown-budget'

function fakeSocket() {
  const socket = new PassThrough()
  const setTimeout = jest.fn()
  Object.assign(socket, { setTimeout })
  return { socket, setTimeout }
}

describe('armUnclaimedUpgradeSocketTimeout', () => {
  it('arms the idle budget and destroys an unclaimed socket on timeout', () => {
    const { socket, setTimeout } = fakeSocket()
    armUnclaimedUpgradeSocketTimeout(socket)
    expect(setTimeout).toHaveBeenCalledWith(PENDING_UPGRADE_IDLE_TIMEOUT_MS)

    socket.emit('timeout')
    expect(socket.destroyed).toBe(true)
  })

  it('does not arm when another listener already claimed the socket', () => {
    const { socket, setTimeout } = fakeSocket()
    socket.on('data', () => {})
    armUnclaimedUpgradeSocketTimeout(socket)
    expect(setTimeout).not.toHaveBeenCalled()
  })

  it('spares a socket claimed after arming and disarms the timeout', () => {
    const { socket, setTimeout } = fakeSocket()
    armUnclaimedUpgradeSocketTimeout(socket)

    // A listener claims the socket after our handler returned.
    socket.on('data', () => {})
    socket.emit('timeout')
    expect(socket.destroyed).toBe(false)
    // The timeout was disarmed.
    expect(setTimeout).toHaveBeenLastCalledWith(0)
  })

  it('is a no-op for sockets without setTimeout', () => {
    const socket = new PassThrough()
    expect(() => armUnclaimedUpgradeSocketTimeout(socket)).not.toThrow()
    expect(socket.destroyed).toBe(false)
    socket.destroy()
  })
})
