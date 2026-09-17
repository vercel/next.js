export const config = {
  runtime: 'edge',
}

export default function handler() {
  const detected = typeof globalThis.process?.getBuiltinModule === 'function'
  const present = 'getBuiltinModule' in process

  let usedFallback = false
  if (globalThis.process?.getBuiltinModule) {
    globalThis.process.getBuiltinModule('fs')
  } else {
    usedFallback = true
  }

  let unsupportedApiError = null
  try {
    process.cwd()
  } catch (err) {
    unsupportedApiError = err.message
  }

  return Response.json({
    detected,
    present,
    usedFallback,
    unsupportedApiError,
  })
}
