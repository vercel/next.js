'use client'

import compatRouter, * as compatRouterEsm from 'next/compat/router'
import cache, * as cacheEsm from 'next/cache'
import client, * as clientEsm from 'next/client'
import ErrorComponent, * as errorEsm from 'next/error'
import * as navigationEsm from 'next/navigation'
import offline, * as offlineEsm from 'next/offline'
import webVitals, * as webVitalsEsm from 'next/web-vitals'
import {
  describeEntry,
  describeNamespaceEntry,
} from '../../../lib/export-matches'

const compatRouterCjs = require('next/compat/router')
const cacheCjs = require('next/cache')
const clientCjs = require('next/client')
const errorCjs = require('next/error')
const navigationCjs = require('next/navigation')
const offlineCjs = require('next/offline')
const webVitalsCjs = require('next/web-vitals')

// The client layer does not get the `.react-server` aliases, so `next/error`
// keeps its Pages Router default export and `next/navigation` exposes the full
// client navigation surface. Asserting both here is what pins the difference
// between the two layers.
const checks = {
  cache: describeEntry(cache, cacheEsm, cacheCjs, ['unstable_cache']),
  client: describeEntry(client, clientEsm, clientCjs, ['emitter', 'router']),
  'compat/router': describeEntry(
    compatRouter,
    compatRouterEsm,
    compatRouterCjs,
    ['useRouter']
  ),
  error: describeEntry(ErrorComponent, errorEsm, errorCjs, []),
  // The client layer gets the full navigation surface, including the hooks that
  // the react-server variant deliberately omits.
  navigation: describeNamespaceEntry(navigationEsm, navigationCjs, [
    'useRouter',
    'usePathname',
    'useSearchParams',
    'useParams',
    'redirect',
    'notFound',
  ]),
  offline: describeEntry(offline, offlineEsm, offlineCjs, ['useOffline']),
  'web-vitals': describeEntry(webVitals, webVitalsEsm, webVitalsCjs, [
    'useReportWebVitals',
  ]),
}

// `next/root-params` requires compiler replacement, a root dynamic segment, and
// its experimental flag, so it cannot be meaningfully exercised by this fixture.
// `next/font/google` and `next/font/local` are compile-time transformed APIs, so
// runtime import identity checks do not apply to them.

export function ClientApiExportChecks() {
  return Object.entries(checks).map(([name, shape]) => (
    <li key={name} data-layer="client" data-api={name} data-shape={shape} />
  ))
}
