// ESM. Mirrors @react-aria/button, which imports a named export from
// @react-aria/i18n. When this package is externalized, Turbopack loads it with
// `import()` and Node's ESM resolver follows this import into `i18n-pkg`.
import { useMessageFormatter } from 'i18n-pkg'

export function getButtonMessage() {
  // Not actually a React hook; the name mirrors @react-aria/i18n's export, which
  // is what the reproduced error message references.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useMessageFormatter()
}
