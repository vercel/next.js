import { ClientEnv } from './client-env'

const env = import.meta.env
const { DEV, PROD, MODE, BASE_URL, SSR } = env
const bracketMode = import.meta.env['MODE']
const unknown = (env as unknown as Record<string, unknown>).UNKNOWN

if (!import.meta.env.SSR) {
  require('this-server-only-package-does-not-exist')
}

if (import.meta.env.DEV && import.meta.env.PROD) {
  require('this-impossible-package-does-not-exist')
}

export default function Page() {
  return (
    <main>
      <dl id="server-env">
        <dt>env</dt>
        <dd>{JSON.stringify({ DEV, PROD, MODE, BASE_URL, SSR })}</dd>
        <dt>bracket-mode</dt>
        <dd>{bracketMode}</dd>
        <dt>unknown</dt>
        <dd>{String(unknown)}</dd>
      </dl>
      <ClientEnv />
    </main>
  )
}
