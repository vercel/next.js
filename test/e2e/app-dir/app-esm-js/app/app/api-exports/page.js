import error, * as errorEsm from 'next/error'
import headers, * as headersEsm from 'next/headers'
import {
  apiExportChecks,
  namespaceExportsMatch,
} from '../../../lib/api-exports'
import { ClientApiExportChecks } from './client'

const headersCjs = require('next/headers')
const errorCjs = require('next/error')

const checks = {
  ...apiExportChecks,
  error: namespaceExportsMatch(error, errorEsm, errorCjs, 'catchError'),
  headers: namespaceExportsMatch(headers, headersEsm, headersCjs, 'headers'),
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
