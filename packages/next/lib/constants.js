import {join} from 'path'
export const NEXT_PROJECT_ROOT = join(__dirname, '..', '..')
export const NEXT_PROJECT_ROOT_DIST = join(NEXT_PROJECT_ROOT, 'dist')
export const NEXT_PROJECT_ROOT_NODE_MODULES = join(NEXT_PROJECT_ROOT, 'node_modules')
export const DEFAULT_PAGES_DIR = join(NEXT_PROJECT_ROOT_DIST, 'pages')
export const NEXT_PROJECT_ROOT_DIST_CLIENT = join(NEXT_PROJECT_ROOT_DIST, 'client')
export const NEXT_PROJECT_ROOT_DIST_SERVER = join(NEXT_PROJECT_ROOT_DIST, 'server')
