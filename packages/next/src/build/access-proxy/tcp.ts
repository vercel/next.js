import type { Addresses } from './types'

const TCP_BINDING: any = (process as any).binding('tcp_wrap')

export function tcpProxy(addresses: Addresses): () => void {
  const existingMethod = TCP_BINDING.TCP.prototype.connect
  TCP_BINDING.TCP.prototype.connect = function (
    this: unknown,
    ...rest: Array<string | undefined>
  ) {
    const addr = rest?.[1]
    const port = rest?.[2] ?? ''

    if (addr !== undefined) {
      addresses.push({ addr, port })
    }

    return existingMethod.apply(this, rest)
  }
  return () => {
    TCP_BINDING.TCP.prototype.connect = existingMethod
  }
}
