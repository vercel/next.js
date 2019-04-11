import {BUILD_MANIFEST, CLIENT_STATIC_FILES_PATH, REACT_LOADABLE_MANIFEST, SERVER_DIRECTORY} from 'next-server/constants';
import { join } from 'path';

import { requirePage } from './require';

function interopDefault(mod: any) {
  return mod.default || mod
}

export async function loadComponents(distDir: string, buildId: string, pathname: string) {
  const documentPath = join(distDir, SERVER_DIRECTORY, CLIENT_STATIC_FILES_PATH, buildId, 'pages', '_document')
  const appPath = join(distDir, SERVER_DIRECTORY, CLIENT_STATIC_FILES_PATH, buildId, 'pages', '_app')

  const [buildManifest, reactLoadableManifest, Component, Document, App] = await Promise.all([
    require(join(distDir, BUILD_MANIFEST)),
    require(join(distDir, REACT_LOADABLE_MANIFEST)),
    interopDefault(requirePage(pathname, distDir)),
    interopDefault(require(documentPath)),
    interopDefault(require(appPath)),
  ])

  return {buildManifest, reactLoadableManifest, Component, Document, App}
}
