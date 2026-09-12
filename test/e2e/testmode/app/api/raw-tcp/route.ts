import net from 'node:net'

function probeRawSocket(port: number) {
  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.write('ping')
    })
    socket.on('data', (data) => {
      socket.end()
      resolve(data.toString())
    })
    socket.on('error', reject)
  })
}

export async function GET(request: Request) {
  const port = Number(new URL(request.url).searchParams.get('port'))
  const reply = await probeRawSocket(port)
  return Response.json({ reply })
}
