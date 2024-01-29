import http from 'http'

export const getFreePort = async (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const server = http.createServer(() => {})
    server.listen(0, () => {
      const address = server.address()
      server.close()

      if (address && typeof address === 'object') {
        resolve(address.port)
      } else {
        reject(new Error('invalid address from server: ' + address?.toString()))
      }
    })
  })
}
