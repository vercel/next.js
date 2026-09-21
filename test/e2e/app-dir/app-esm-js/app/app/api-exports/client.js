'use client'

import * as compatRouterEsm from 'next/compat/router'
import offline, * as offlineEsm from 'next/offline'
import * as webVitalsEsm from 'next/web-vitals'

const compatRouterCjs = require('next/compat/router')
const offlineCjs = require('next/offline')
const webVitalsCjs = require('next/web-vitals')

const checks = {
  'compat/router': compatRouterEsm.useRouter === compatRouterCjs.useRouter,
  offline:
    offline.useOffline === offlineEsm.useOffline &&
    offline.useOffline === offlineCjs.useOffline,
  'web-vitals':
    webVitalsEsm.useReportWebVitals === webVitalsCjs.useReportWebVitals,
}

export function ClientApiExportChecks() {
  return Object.entries(checks).map(([name, passed]) => (
    <li key={name} data-api={name} data-passed={passed} />
  ))
}
