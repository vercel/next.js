import cache, * as cacheEsm from 'next/cache'
import constants, * as constantsEsm from 'next/constants'
import dynamic, * as dynamicEsm from 'next/dynamic'
import Form, * as formEsm from 'next/form'
import Head, * as headEsm from 'next/head'
import Image, * as imageEsm from 'next/image'
import LegacyImage, * as legacyImageEsm from 'next/legacy/image'
import Link, * as linkEsm from 'next/link'
import navigation, * as navigationEsm from 'next/navigation'
import og, * as ogEsm from 'next/og'
import Script, * as scriptEsm from 'next/script'
import server, * as serverEsm from 'next/server'
import { defaultExportMatches, namespaceExportsMatch } from './export-matches'

const cacheCjs = require('next/cache')
const constantsCjs = require('next/constants')
const dynamicCjs = require('next/dynamic')
const formCjs = require('next/form')
const headCjs = require('next/head')
const imageCjs = require('next/image')
const legacyImageCjs = require('next/legacy/image')
const linkCjs = require('next/link')
const navigationCjs = require('next/navigation')
const ogCjs = require('next/og')
const scriptCjs = require('next/script')
const serverCjs = require('next/server')

export { defaultExportMatches, namespaceExportsMatch }

export const apiExportChecks = {
  cache: namespaceExportsMatch(cache, cacheEsm, cacheCjs, 'unstable_cache'),
  constants: namespaceExportsMatch(
    constants,
    constantsEsm,
    constantsCjs,
    'PHASE_PRODUCTION_BUILD'
  ),
  dynamic: defaultExportMatches(dynamic, dynamicEsm, dynamicCjs),
  form: defaultExportMatches(Form, formEsm, formCjs),
  head: defaultExportMatches(Head, headEsm, headCjs),
  image: defaultExportMatches(Image, imageEsm, imageCjs),
  'legacy/image': defaultExportMatches(
    LegacyImage,
    legacyImageEsm,
    legacyImageCjs
  ),
  link: defaultExportMatches(Link, linkEsm, linkCjs),
  navigation: namespaceExportsMatch(
    navigation,
    navigationEsm,
    navigationCjs,
    'redirect'
  ),
  og: namespaceExportsMatch(og, ogEsm, ogCjs, 'ImageResponse'),
  script: defaultExportMatches(Script, scriptEsm, scriptCjs),
  server: namespaceExportsMatch(server, serverEsm, serverCjs, 'NextResponse'),
}
