import os from 'os'

export function getNetworkHost(): string | null {
  const interfaces = os.networkInterfaces()
  let host: string | null = null

  Object.keys(interfaces).forEach((key) =>
    interfaces[key]
      ?.filter(({ family, address }) => {
        return family === 'IPv4' && !address.includes('127.0.0.1')
      })
      .forEach(({ address }) => (host = address))
  )

  return host
}
