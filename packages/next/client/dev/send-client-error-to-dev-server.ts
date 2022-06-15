export default function sendClientErrorToDevServer(
  message: string,
  stackTrace: string
) {
  return fetch('/_next/client-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message,
      stackTrace,
    }),
  }).catch(() => {})
}
