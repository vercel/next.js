import headers, * as headersEsm from 'next/headers'
import {
  apiExportChecks,
  namespaceExportMatches,
} from '../../../lib/api-exports'
import { ClientApiExportChecks } from './client'

const headersCjs = require('next/headers')

const checks = {
  ...apiExportChecks,
  headers: namespaceExportMatches(headers, headersEsm, headersCjs, 'headers'),
}

export default function Page() {
  return (
    <ul>
      {Object.entries(checks).map(([name, passed]) => (
        <li key={name} data-api={name} data-passed={passed} />
      ))}
      <ClientApiExportChecks />
    </ul>
  )
}
