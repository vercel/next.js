import * as errorEsm from 'next/error'
import * as headersEsm from 'next/headers'
import * as navigationEsm from 'next/navigation'
import { apiExportChecks, describeEntry } from '../../../lib/api-exports'
import { ClientApiExportChecks } from './client'

const headersCjs = require('next/headers')
const errorCjs = require('next/error')
const navigationCjs = require('next/navigation')

// In the react-server layer `next/error` is aliased to `error.react-server`,
// which only exposes `catchError`, and `next/navigation` is aliased to
// `navigation.react-server`, which has no default export. Neither entry can be
// default-imported here, so both pass `undefined` as the default binding.
const checks = {
  ...apiExportChecks,
  error: describeEntry(undefined, errorEsm, errorCjs, ['catchError']),
  headers: describeEntry(undefined, headersEsm, headersCjs, [
    'cookies',
    'headers',
    'draftMode',
  ]),
  // `redirect` and `notFound` come from `navigation.react-server`, while
  // `useRouter` is client-only and must NOT be present in this layer. The
  // absence assertion below is what pins the react-server alias.
  navigation: describeEntry(undefined, navigationEsm, navigationCjs, [
    'redirect',
    'permanentRedirect',
    'notFound',
    'forbidden',
    'unauthorized',
  ]),
}

const clientOnlyNavigationExports = [
  'useRouter',
  'usePathname',
  'useSearchParams',
  'useParams',
  'useSelectedLayoutSegment',
]

// Hooks that only exist in `navigation`, not `navigation.react-server`. If this
// is ever non-empty, the react-server layer resolved the client entry.
const leakedClientNavigationExports = clientOnlyNavigationExports
  .filter((name) => name in navigationEsm)
  .join(',')

export default function Page() {
  return (
    <ul>
      <li data-leaked-client-navigation={leakedClientNavigationExports} />
      {Object.entries(checks).map(([name, shape]) => (
        <li
          key={name}
          data-layer="react-server"
          data-api={name}
          data-shape={shape}
        />
      ))}
      <ClientApiExportChecks />
    </ul>
  )
}
