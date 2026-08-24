import { traceId } from './shared'
import { Telemetry } from '../telemetry/storage'

export default function uploadTrace({
  traceUploadUrl,
  mode,
  projectDir,
  distDir,
  isTurboSession,
  sync,
}: {
  traceUploadUrl: string
  mode: 'dev' | 'build'
  projectDir: string
  distDir: string
  isTurboSession: boolean
  sync?: boolean
}) {
  const { NEXT_TRACE_UPLOAD_DEBUG } = process.env
  const telemetry = new Telemetry({ distDir })

  // Note: cross-spawn is not used here as it causes
  // a new command window to appear when we don't want it to
  const child_process =
    require('child_process') as typeof import('child_process')

  // we use spawnSync when debugging to ensure logs are piped
  // correctly to stdout/stderr
  const spawn =
    NEXT_TRACE_UPLOAD_DEBUG || sync
      ? child_process.spawnSync
      : child_process.spawn

  const child = spawn(
    process.execPath,
    [
      require.resolve('./trace-uploader'),
      traceUploadUrl,
      mode,
      projectDir,
      distDir,
      String(isTurboSession),
      traceId,
      telemetry.anonymousId,
      telemetry.sessionId,
    ],
    {
      detached: !NEXT_TRACE_UPLOAD_DEBUG,
      windowsHide: true,
      shell: false,
      ...(NEXT_TRACE_UPLOAD_DEBUG
        ? {
            stdio: 'inherit',
          }
        : {}),
    }
  )

  // Unref the detached child so it doesn't prevent the parent from exiting,
  // and attach an error handler to avoid unhandled rejection on spawn failure.
  if (child && 'unref' in child) {
    child.unref()
    child.on?.('error', () => {
      // Silently ignore spawn errors for the detached trace uploader.
    })
  }
}
