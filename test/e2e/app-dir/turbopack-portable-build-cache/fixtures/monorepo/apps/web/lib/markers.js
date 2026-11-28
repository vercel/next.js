import { loaderMarker } from './loaded.marker.js'
import { resolveAliasMarker } from 'resolve-alias-target'
// Resolved through the `paths` alias in `jsconfig.json`, outside of the app.
import { jsconfigPathsMarker } from '@shared/paths-target.js'
// `linked` is a relative symlink to `packages/shared`, created by the test.
import { symlinkMarker } from '../linked/symlink-target.js'
// `node_modules/@portable/ui` is a relative workspace symlink to `packages/ui`.
import { workspaceMarker } from '@portable/ui'

export const markers = [
  loaderMarker,
  resolveAliasMarker,
  jsconfigPathsMarker,
  symlinkMarker,
  workspaceMarker,
]
