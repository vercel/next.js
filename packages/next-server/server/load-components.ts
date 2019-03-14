import {join} from 'path'
import {CLIENT_STATIC_FILES_PATH, BUILD_MANIFEST, REACT_LOADABLE_MANIFEST, SERVER_DIRECTORY} from 'next-server/constants'
import {requirePage} from './require'

function interopDefault(mod: any) {
  return mod.default || mod
}

export async function loadComponents(distDir: string, buildId: string, pathname: string) {
  const documentPath = join(distDir, SERVER_DIRECTORY, CLIENT_STATIC_FILES_PATH, buildId, 'pages', '_document')
  const [buildManifest, reactLoadableManifest, Component, Document] = await Promise.all([
    require(join(distDir, BUILD_MANIFEST)),
    require(join(distDir, REACT_LOADABLE_MANIFEST)),
    interopDefault(requirePage(pathname, distDir)),
    interopDefault(require(documentPath)),
  ])

  let App
  try {
    App = interopDefault(require('private-next-pages/_app'))
  } catch (e) {
    App = interopDefault(require('next/dist/pages/_app'))
  }

  return {buildManifest, reactLoadableManifest, Component, Document, App}
}
