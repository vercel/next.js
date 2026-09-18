import App, * as appEsm from 'next/app'
import client, * as clientEsm from 'next/client'
import Document, * as documentEsm from 'next/document'
import ErrorComponent, * as errorEsm from 'next/error'
import Router, * as routerEsm from 'next/router'
import * as compatRouterEsm from 'next/compat/router'
import offline, * as offlineEsm from 'next/offline'
import * as webVitalsEsm from 'next/web-vitals'
import {
  apiExportChecks,
  defaultExportMatches,
  namespaceExportsMatch,
} from '../lib/api-exports'

const appCjs = require('next/app')
const clientCjs = require('next/client')
const documentCjs = require('next/document')
const errorCjs = require('next/error')
const routerCjs = require('next/router')
const compatRouterCjs = require('next/compat/router')
const offlineCjs = require('next/offline')
const webVitalsCjs = require('next/web-vitals')

export async function getServerSideProps() {
  return {
    props: {
      checks: {
        ...apiExportChecks,
        app: defaultExportMatches(App, appEsm, appCjs),
        client: namespaceExportsMatch(client, clientEsm, clientCjs, 'emitter'),
        document: defaultExportMatches(Document, documentEsm, documentCjs),
        error: defaultExportMatches(ErrorComponent, errorEsm, errorCjs),
        router: defaultExportMatches(Router, routerEsm, routerCjs),
        'compat/router': namespaceExportsMatch(
          compatRouterEsm.default,
          compatRouterEsm,
          compatRouterCjs,
          'useRouter'
        ),
        offline: namespaceExportsMatch(
          offline,
          offlineEsm,
          offlineCjs,
          'useOffline'
        ),
        'web-vitals': namespaceExportsMatch(
          webVitalsEsm.default,
          webVitalsEsm,
          webVitalsCjs,
          'useReportWebVitals'
        ),
      },
    },
  }
}

export default function Page({ checks }) {
  return (
    <ul>
      {Object.entries(checks).map(([name, passed]) => (
        <li key={name} data-api={name} data-passed={passed} />
      ))}
    </ul>
  )
}
