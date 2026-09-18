import App, * as appEsm from 'next/app'
import cache, * as cacheEsm from 'next/cache'
import cacheExt from 'next/cache.js'
import * as compatRouterEsm from 'next/compat/router'
import constants, * as constantsEsm from 'next/constants'
import Document, * as documentEsm from 'next/document'
import dynamic, * as dynamicEsm from 'next/dynamic'
import ErrorComponent, * as errorEsm from 'next/error'
import Form, * as formEsm from 'next/form'
import Head, * as headEsm from 'next/head'
import Image, * as imageEsm from 'next/image'
import LegacyImage, * as legacyImageEsm from 'next/legacy/image'
import Link, * as linkEsm from 'next/link'
import navigation, * as navigationEsm from 'next/navigation'
import offline, * as offlineEsm from 'next/offline'
import og, * as ogEsm from 'next/og'
import Router, * as routerEsm from 'next/router'
import Script, * as scriptEsm from 'next/script'
import server, * as serverEsm from 'next/server'
import * as webVitalsEsm from 'next/web-vitals'

const appCjs = require('next/app')
const cacheCjs = require('next/cache')
const cacheExtCjs = require('next/cache.js')
const compatRouterCjs = require('next/compat/router')
const constantsCjs = require('next/constants')
const documentCjs = require('next/document')
const dynamicCjs = require('next/dynamic')
const errorCjs = require('next/error')
const formCjs = require('next/form')
const headCjs = require('next/head')
const imageCjs = require('next/image')
const legacyImageCjs = require('next/legacy/image')
const linkCjs = require('next/link')
const navigationCjs = require('next/navigation')
const offlineCjs = require('next/offline')
const ogCjs = require('next/og')
const routerCjs = require('next/router')
const scriptCjs = require('next/script')
const serverCjs = require('next/server')
const serverExtCjs = require('next/server.js')
const webVitalsCjs = require('next/web-vitals')

function defaultExportMatches(esmDefault, esmNamespace, commonJs) {
  return esmDefault === esmNamespace.default && esmDefault === commonJs.default
}

function namespaceExportMatches(
  esmDefault,
  esmNamespace,
  commonJs,
  exportName
) {
  return (
    esmDefault[exportName] === esmNamespace[exportName] &&
    esmDefault[exportName] === commonJs[exportName]
  )
}

export function getApiExportChecks() {
  return {
    app: defaultExportMatches(App, appEsm, appCjs),
    cache: namespaceExportMatches(cache, cacheEsm, cacheCjs, 'unstable_cache'),
    'cache.js': cacheExt.unstable_cache === cacheExtCjs.unstable_cache,
    'compat/router': compatRouterEsm.useRouter === compatRouterCjs.useRouter,
    constants: namespaceExportMatches(
      constants,
      constantsEsm,
      constantsCjs,
      'PHASE_PRODUCTION_BUILD'
    ),
    document: defaultExportMatches(Document, documentEsm, documentCjs),
    dynamic: defaultExportMatches(dynamic, dynamicEsm, dynamicCjs),
    error: defaultExportMatches(ErrorComponent, errorEsm, errorCjs),
    form: defaultExportMatches(Form, formEsm, formCjs),
    head: defaultExportMatches(Head, headEsm, headCjs),
    image: defaultExportMatches(Image, imageEsm, imageCjs),
    'legacy/image': defaultExportMatches(
      LegacyImage,
      legacyImageEsm,
      legacyImageCjs
    ),
    link: defaultExportMatches(Link, linkEsm, linkCjs),
    navigation: namespaceExportMatches(
      navigation,
      navigationEsm,
      navigationCjs,
      'redirect'
    ),
    offline: namespaceExportMatches(
      offline,
      offlineEsm,
      offlineCjs,
      'useOffline'
    ),
    og: namespaceExportMatches(og, ogEsm, ogCjs, 'ImageResponse'),
    router: defaultExportMatches(Router, routerEsm, routerCjs),
    script: defaultExportMatches(Script, scriptEsm, scriptCjs),
    server: namespaceExportMatches(
      server,
      serverEsm,
      serverCjs,
      'NextResponse'
    ),
    'server.js': server.NextResponse === serverExtCjs.NextResponse,
    'web-vitals':
      webVitalsEsm.useReportWebVitals === webVitalsCjs.useReportWebVitals,
  }
}
