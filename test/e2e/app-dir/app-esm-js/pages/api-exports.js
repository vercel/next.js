import App, * as appEsm from 'next/app'
import Document, * as documentEsm from 'next/document'
import ErrorComponent, * as errorEsm from 'next/error'
import Router, * as routerEsm from 'next/router'
import * as compatRouterEsm from 'next/compat/router'
import offline, * as offlineEsm from 'next/offline'
import * as webVitalsEsm from 'next/web-vitals'
import { apiExportChecks, defaultExportMatches } from '../lib/api-exports'

const appCjs = require('next/app')
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
        document: defaultExportMatches(Document, documentEsm, documentCjs),
        error: defaultExportMatches(ErrorComponent, errorEsm, errorCjs),
        router: defaultExportMatches(Router, routerEsm, routerCjs),
        'compat/router':
          compatRouterEsm.useRouter === compatRouterCjs.useRouter,
        offline:
          offline.useOffline === offlineEsm.useOffline &&
          offline.useOffline === offlineCjs.useOffline,
        'web-vitals':
          webVitalsEsm.useReportWebVitals === webVitalsCjs.useReportWebVitals,
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
