import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'

export function registerPauseCompilationTool(
  server: McpServer,
  pauseCompilation: () => void
) {
  server.registerTool(
    'pause_compilation',
    {
      description:
        'Pause compilation. File watching continues, but compilation is deferred until compile_and_resume is called. Use this at the start of an editing session to prevent wasted intermediate compilations and ephemeral errors.',
      inputSchema: {},
    },
    async () => {
      mcpTelemetryTracker.recordToolCall('mcp/pause_compilation')
      pauseCompilation()
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ status: 'compilation_paused' }),
          },
        ],
      }
    }
  )
}

export function registerCompileAndResumeTool(
  server: McpServer,
  compileAndResume: () => Promise<void>
) {
  server.registerTool(
    'compile_and_resume',
    {
      description:
        'Compile all accumulated file changes in a single batch, then resume normal compilation. Waits for compilation to complete before returning. No-op if compilation is not paused.',
      inputSchema: {},
    },
    async () => {
      mcpTelemetryTracker.recordToolCall('mcp/compile_and_resume')
      await compileAndResume()
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ status: 'compiled_and_resumed' }),
          },
        ],
      }
    }
  )
}
