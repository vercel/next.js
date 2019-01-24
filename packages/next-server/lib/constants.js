export const PAGES_MANIFEST = 'pages-manifest.json'
export const BUILD_MANIFEST = 'build-manifest.json'
export const REACT_LOADABLE_MANIFEST = 'react-loadable-manifest.json'
export const SERVER_DIRECTORY = 'server'
export const CONFIG_FILE = 'next.config.js'
export const BUILD_ID_FILE = 'BUILD_ID'
export const BLOCKED_PAGES = [
  '/_document',
  '/_app',
  '/_error'
]
export const CLIENT_STATIC_FILES_PATH = 'static'
export const CLIENT_STATIC_FILES_RUNTIME = 'runtime'
export const CLIENT_STATIC_FILES_RUNTIME_PATH = `${CLIENT_STATIC_FILES_PATH}/${CLIENT_STATIC_FILES_RUNTIME}`
// static/runtime/main.js
export const CLIENT_STATIC_FILES_RUNTIME_MAIN = `${CLIENT_STATIC_FILES_RUNTIME_PATH}/main.js`
// static/runtime/webpack.js
export const CLIENT_STATIC_FILES_RUNTIME_WEBPACK = `${CLIENT_STATIC_FILES_RUNTIME_PATH}/webpack.js`
// matches static/<buildid>/pages/<page>.js
export const IS_BUNDLED_PAGE_REGEX = /^static[/\\][^/\\]+[/\\]pages.*\.js$/
// matches static/<buildid>/pages/:page*.js
export const ROUTE_NAME_REGEX = /^static[/\\][^/\\]+[/\\]pages[/\\](.*)\.js$/
