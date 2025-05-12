// Compile with pnpm tsc test/e2e/app-dir/server-source-maps/fixtures/default/bad-sourcemap/page.js --allowJs --sourceMap --target esnext --outDir test/e2e/app-dir/server-source-maps/fixtures/default/app/bad-sourcemap
// Then change the `sources` entry in the sourcemap to `["custom://[badhost]/app/bad-sourcemap/page.js"]`
// tsc compile errors can be ignored

import { connection } from 'next/server'

function logError() {
  console.error(new Error('bad-sourcemap'))
}

export default async function Page() {
  await connection()
  logError()
  return <p>Hello, Dave!</p>
}
