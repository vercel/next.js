import cache, * as cacheEsm from 'next/cache'
import cacheExt from 'next/cache.js'
import constants, * as constantsEsm from 'next/constants'
import dynamic, * as dynamicEsm from 'next/dynamic'
import Form, * as formEsm from 'next/form'
import Head, * as headEsm from 'next/head'
import headers, * as headersEsm from 'next/headers'
import Image, * as imageEsm from 'next/image'
import LegacyImage, * as legacyImageEsm from 'next/legacy/image'
import Link, * as linkEsm from 'next/link'
import navigation, * as navigationEsm from 'next/navigation'
import offline, * as offlineEsm from 'next/offline'
import og, * as ogEsm from 'next/og'
import Script, * as scriptEsm from 'next/script'
import server, * as serverEsm from 'next/server'

const cacheCjs = require('next/cache')
const cacheExtCjs = require('next/cache.js')
const constantsCjs = require('next/constants')
const dynamicCjs = require('next/dynamic')
const formCjs = require('next/form')
const headCjs = require('next/head')
const headersCjs = require('next/headers')
const imageCjs = require('next/image')
const legacyImageCjs = require('next/legacy/image')
const linkCjs = require('next/link')
const navigationCjs = require('next/navigation')
const offlineCjs = require('next/offline')
const ogCjs = require('next/og')
const scriptCjs = require('next/script')
const serverCjs = require('next/server')
const serverExtCjs = require('next/server.js')

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

const checks = {
  cache: namespaceExportMatches(cache, cacheEsm, cacheCjs, 'unstable_cache'),
  'cache.js': cacheExt.unstable_cache === cacheExtCjs.unstable_cache,
  constants: namespaceExportMatches(
    constants,
    constantsEsm,
    constantsCjs,
    'PHASE_PRODUCTION_BUILD'
  ),
  dynamic: defaultExportMatches(dynamic, dynamicEsm, dynamicCjs),
  form: defaultExportMatches(Form, formEsm, formCjs),
  head: defaultExportMatches(Head, headEsm, headCjs),
  headers: namespaceExportMatches(headers, headersEsm, headersCjs, 'headers'),
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
  script: defaultExportMatches(Script, scriptEsm, scriptCjs),
  server: namespaceExportMatches(server, serverEsm, serverCjs, 'NextResponse'),
  'server.js': server.NextResponse === serverExtCjs.NextResponse,
}

export default function Page() {
  return (
    <ul>
      {Object.entries(checks).map(([name, passed]) => (
        <li key={name} data-api={name} data-passed={passed} />
      ))}
    </ul>
  )
}
