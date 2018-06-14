import {join} from 'path'
export const PHASE_EXPORT = 'phase-export'
export const PHASE_PRODUCTION_BUILD = 'phase-production-build'
export const PHASE_PRODUCTION_SERVER = 'phase-production-server'
export const PHASE_DEVELOPMENT_SERVER = 'phase-development-server'
export const PAGES_MANIFEST = 'pages-manifest.json'
export const BUILD_MANIFEST = 'build-manifest.json'
export const SERVER_DIRECTORY = 'server'
export const CONFIG_FILE = 'next.config.js'
export const BUILD_ID_FILE = 'BUILD_ID'
export const BLOCKED_PAGES = [
  '/_document',
  '/_app',
  '/_error'
]
export const IS_BUNDLED_PAGE_REGEX = /^bundles[/\\]pages.*\.js$/
export const ROUTE_NAME_REGEX = /^bundles[/\\]pages[/\\](.*)\.js$/
export const NEXT_PROJECT_ROOT = join(__dirname, '..', '..')
export const NEXT_PROJECT_ROOT_DIST = join(NEXT_PROJECT_ROOT, 'dist')
export const NEXT_PROJECT_ROOT_NODE_MODULES = join(NEXT_PROJECT_ROOT, 'node_modules')
export const DEFAULT_PAGES_DIR = join(NEXT_PROJECT_ROOT_DIST, 'pages')
