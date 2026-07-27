import net from 'net'
import type { Addresses, RestoreOriginalFunction } from './types'

/**
 * Proxy the TCP connect method to determine if any network access is made during the build
 *
 * @param addresses An array to track the addresses that are accessed.
 * @returns A function that restores the original connect method.
 */
export function tcpProxy(addresses: Addresses): RestoreOriginalFunction {
  // net.Socket docs https://nodejs.org/api/net.html#class-netsocket
  const originalConnect = net.Socket.prototype.connect

  // Override the connect method
  net.Socket.prototype.connect = function (...args: any) {
    // First, check if the first argument is an object and not null
    if (typeof args[0] === 'object' && args[0] !== null) {
      const options = args[0] as net.SocketConnectOpts

      // check if the options has what we need
      if (
        'port' in options &&
        options.port !== undefined &&
        'host' in options &&
        options.host !== undefined
      ) {
        addresses.push({ addr: options.host, port: options.port.toString() })
      }
    }

    return originalConnect.apply(this, args)
  }

  return () => {
    // Restore the original connect method
    net.Socket.prototype.connect = originalConnect
  }
}
