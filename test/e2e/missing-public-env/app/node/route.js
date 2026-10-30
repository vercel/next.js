import { readEnv, debugMessage } from '../../lib/env'
import { readRuntime, shadowed, writes } from '../../lib/runtime'
import { readImportedProcess } from '../../lib/imported-process'

export const dynamic = 'force-dynamic'

export function GET(request) {
  const key = new URL(request.url).searchParams.get('key')
  if (key) process.env[key] = 'runtime-value'
  process.env.MISSING_ENV_RUNTIME_TEST = 'private-runtime-value'
  try {
    return Response.json({
      ...readEnv(),
      message: debugMessage(),
      runtime: key ? process.env[key] : null,
      excluded: readRuntime(key),
      shadowed: shadowed({
        env: { NEXT_PUBLIC_MISSING_ENV_TEST: 'local-value' },
      }),
      writes: writes(),
      importedProcess: readImportedProcess(),
      serverCompiler: process.env.NEXT_PUBLIC_MISSING_ENV_SERVER_COMPILER,
    })
  } finally {
    if (key) delete process.env[key]
    delete process.env.MISSING_ENV_RUNTIME_TEST
  }
}
