'use client'

import * as compatRouterEsm from 'next/compat/router'
import cache, * as cacheEsm from 'next/cache'
import client, * as clientEsm from 'next/client'
import offline, * as offlineEsm from 'next/offline'
import * as webVitalsEsm from 'next/web-vitals'
import { namespaceExportsMatch } from '../../../lib/export-matches'

const compatRouterCjs = require('next/compat/router')
const cacheCjs = require('next/cache')
const clientCjs = require('next/client')
const offlineCjs = require('next/offline')
const webVitalsCjs = require('next/web-vitals')

const checks = {
  cache: namespaceExportsMatch(cache, cacheEsm, cacheCjs, 'unstable_cache'),
  client: namespaceExportsMatch(client, clientEsm, clientCjs, 'emitter'),
  'compat/router': namespaceExportsMatch(
    compatRouterEsm.default,
    compatRouterEsm,
    compatRouterCjs,
    'useRouter'
  ),
  offline: namespaceExportsMatch(offline, offlineEsm, offlineCjs, 'useOffline'),
  'web-vitals': namespaceExportsMatch(
    webVitalsEsm.default,
    webVitalsEsm,
    webVitalsCjs,
    'useReportWebVitals'
  ),
}

// `next/root-params` requires compiler replacement, a root dynamic segment, and
// its experimental flag, so it cannot be meaningfully exercised by this fixture.
// `next/font/google` and `next/font/local` are compile-time transformed APIs, so
// runtime import identity checks do not apply to them.

export function ClientApiExportChecks() {
  return Object.entries(checks).map(([name, passed]) => (
    <li key={name} data-api={name} data-passed={passed} />
  ))
}
