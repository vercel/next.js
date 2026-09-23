import cache, * as cacheEsm from 'next/cache'
import * as constantsEsm from 'next/constants'
import dynamic, * as dynamicEsm from 'next/dynamic'
import Form, * as formEsm from 'next/form'
import Head, * as headEsm from 'next/head'
import Image, * as imageEsm from 'next/image'
import LegacyImage, * as legacyImageEsm from 'next/legacy/image'
import Link, * as linkEsm from 'next/link'
import * as ogEsm from 'next/og'
import Script, * as scriptEsm from 'next/script'
import * as serverEsm from 'next/server'
import { describeEntry, describeNamespaceEntry } from './export-matches'

export { describeEntry }

// `next/error` and `next/navigation` are intentionally absent here: they are
// aliased to `.react-server` variants in the react-server layer, so their shape
// differs per layer and each entrypoint asserts them separately.
//
// Read optional defaults from the namespace for entries that do not declare a
// default export. A syntactic default import makes webpack emit an export
// warning even though some bundlers synthesize a default at runtime.
export const apiExportChecks = {
  cache: describeEntry(cache, cacheEsm, require('next/cache'), [
    'unstable_cache',
    'revalidateTag',
    'cacheLife',
  ]),
  constants: describeNamespaceEntry(constantsEsm, require('next/constants'), [
    'PHASE_PRODUCTION_BUILD',
    'PHASE_DEVELOPMENT_SERVER',
  ]),
  dynamic: describeEntry(dynamic, dynamicEsm, require('next/dynamic'), [
    'noSSR',
  ]),
  form: describeEntry(Form, formEsm, require('next/form'), []),
  head: describeEntry(Head, headEsm, require('next/head'), []),
  image: describeEntry(Image, imageEsm, require('next/image'), [
    'getImageProps',
  ]),
  'legacy/image': describeEntry(
    LegacyImage,
    legacyImageEsm,
    require('next/legacy/image'),
    []
  ),
  link: describeEntry(Link, linkEsm, require('next/link'), ['useLinkStatus']),
  og: describeNamespaceEntry(ogEsm, require('next/og'), ['ImageResponse']),
  script: describeEntry(Script, scriptEsm, require('next/script'), [
    'handleClientScriptLoad',
    'initScriptLoader',
  ]),
  server: describeNamespaceEntry(serverEsm, require('next/server'), [
    'NextRequest',
    'NextResponse',
    'after',
    'connection',
  ]),
}
