import { AnalyzeRepository } from './repository'
import { createAnalyzeMcpServer } from './mcp-server'

type McpServer = ReturnType<typeof createAnalyzeMcpServer>
type Transport = Parameters<McpServer['connect']>[0]
type Message = Parameters<Transport['send']>[0]
type SendOptions = Parameters<Transport['send']>[1]

class LinkedTransport implements Transport {
  private peer?: LinkedTransport
  onclose?: Transport['onclose']
  onerror?: Transport['onerror']
  onmessage?: Transport['onmessage']

  static createPair(): [LinkedTransport, LinkedTransport] {
    const client = new LinkedTransport()
    const server = new LinkedTransport()
    client.peer = server
    server.peer = client
    return [client, server]
  }

  async start(): Promise<void> {}

  async send(message: Message, _options?: SendOptions): Promise<void> {
    if (!this.peer) throw new Error('MCP transport is closed')
    this.peer.onmessage?.(message)
  }

  async close(): Promise<void> {
    const peer = this.peer
    this.peer = undefined
    if (peer?.peer) await peer.close()
    this.onclose?.()
  }
}

type RpcResponse = {
  id?: string | number
  result?: {
    content?: Array<{ type: string; text?: string }>
    isError?: boolean
  }
  error?: { message?: string }
}

/** Invoke an analyzer tool in-process without starting an HTTP server. */
export async function queryAnalyzeData(
  analyzeDir: string,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const mcpServer = createAnalyzeMcpServer(new AnalyzeRepository(analyzeDir))
  const [clientTransport, serverTransport] = LinkedTransport.createPair()
  const response = new Promise<RpcResponse>((resolve) => {
    clientTransport.onmessage = (message) => resolve(message as RpcResponse)
  })

  try {
    await mcpServer.connect(serverTransport)
    await clientTransport.start()
    await clientTransport.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    } as Message)

    const message = await response
    if (message.error)
      throw new Error(message.error.message || 'MCP query failed')
    const result = message.result
    const text = result?.content?.find((item) => item.type === 'text')?.text
    if (!text) throw new Error('MCP tool returned no JSON content')
    const value: unknown = JSON.parse(text)
    if (result?.isError) {
      const detail =
        typeof value === 'object' &&
        value !== null &&
        'error' in value &&
        typeof value.error === 'string'
          ? value.error
          : 'Analyzer query failed'
      throw new Error(detail)
    }
    return value
  } finally {
    await mcpServer.close()
  }
}
