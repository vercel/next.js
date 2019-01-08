import {join} from 'path'
export const NEXT_PROJECT_ROOT = join(__dirname, '..', '..')
export const NEXT_PROJECT_ROOT_DIST = join(NEXT_PROJECT_ROOT, 'dist')
export const NEXT_PROJECT_ROOT_NODE_MODULES = join(NEXT_PROJECT_ROOT, 'node_modules')
export const DEFAULT_PAGES_DIR = join(NEXT_PROJECT_ROOT_DIST, 'pages')
export const NEXT_PROJECT_ROOT_DIST_CLIENT = join(NEXT_PROJECT_ROOT_DIST, 'client')
export const NEXT_PROJECT_ROOT_DIST_SERVER = join(NEXT_PROJECT_ROOT_DIST, 'server')

// Because on Windows absolute paths in the generated code can break because of numbers, eg 1 in the path,
// we have to use a private alias
export const PAGES_DIR_ALIAS = 'private-next-pages'
export const DOT_NEXT_ALIAS = 'private-dot-next'
