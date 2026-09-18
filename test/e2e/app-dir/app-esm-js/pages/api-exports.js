import App, * as appEsm from 'next/app'
import client, * as clientEsm from 'next/client'
import Document, * as documentEsm from 'next/document'
import ErrorComponent, * as errorEsm from 'next/error'
import navigation, * as navigationEsm from 'next/navigation'
import compatRouter, * as compatRouterEsm from 'next/compat/router'
import offline, * as offlineEsm from 'next/offline'
import webVitals, * as webVitalsEsm from 'next/web-vitals'
import { apiExportChecks, describeEntry } from '../lib/api-exports'

const appCjs = require('next/app')
const clientCjs = require('next/client')
const documentCjs = require('next/document')
const errorCjs = require('next/error')
const navigationCjs = require('next/navigation')
const compatRouterCjs = require('next/compat/router')
const offlineCjs = require('next/offline')
const webVitalsCjs = require('next/web-vitals')

// `next/router` is exercised in the browser check instead: its default export is
// a client-side singleton whose property access throws when read on the server.
export async function getServerSideProps() {
  return {
    props: {
      checks: {
        ...apiExportChecks,
        app: describeEntry(App, appEsm, appCjs, []),
        client: describeEntry(client, clientEsm, clientCjs, [
          'emitter',
          'router',
        ]),
        document: describeEntry(Document, documentEsm, documentCjs, [
          'Html',
          'Head',
          'Main',
          'NextScript',
        ]),
        // The Pages Router never gets the `.react-server` aliases, so
        // `next/error` keeps its `_error` default export here.
        error: describeEntry(ErrorComponent, errorEsm, errorCjs, []),
        navigation: describeEntry(navigation, navigationEsm, navigationCjs, [
          'useRouter',
          'usePathname',
          'redirect',
          'notFound',
        ]),
        'compat/router': describeEntry(
          compatRouter,
          compatRouterEsm,
          compatRouterCjs,
          ['useRouter']
        ),
        offline: describeEntry(offline, offlineEsm, offlineCjs, ['useOffline']),
        'web-vitals': describeEntry(webVitals, webVitalsEsm, webVitalsCjs, [
          'useReportWebVitals',
        ]),
      },
    },
  }
}

export default function Page({ checks }) {
  return (
    <ul>
      {Object.entries(checks).map(([name, shape]) => (
        <li key={name} data-api={name} data-shape={shape} />
      ))}
    </ul>
  )
}
