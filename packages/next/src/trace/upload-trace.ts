export default function uploadTrace({
  traceUploadUrl,
  mode,
  isTurboSession,
  projectDir,
  distDir,
}: {
  traceUploadUrl: string
  mode: 'dev'
  isTurboSession: boolean
  projectDir: string
  distDir: string
}) {
  const { NEXT_TRACE_UPLOAD_DEBUG } = process.env

  // Note: cross-spawn is not used here as it causes
  // a new command window to appear when we don't want it to
  const child_process =
    require('child_process') as typeof import('child_process')

  // we use spawnSync when debugging to ensure logs are piped
  // correctly to stdout/stderr
  const spawn = NEXT_TRACE_UPLOAD_DEBUG
    ? child_process.spawnSync
    : child_process.spawn

  spawn(
    process.execPath,
    [
      require.resolve('./trace-uploader'),
      traceUploadUrl,
      mode,
      String(isTurboSession),
      projectDir,
      distDir,
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
}
