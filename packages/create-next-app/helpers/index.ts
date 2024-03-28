import * as log from './log'
export { log }
export { copy } from './copy'
export {
  isUrlOk,
  getRepoInfo,
  hasRepo,
  existsInRepo,
  downloadAndExtractRepo,
  downloadAndExtractExample,
} from './examples'
export { getPkgManager } from './get-pkg-manager'
export { tryGitInit } from './git'
export { install } from './install'
export { isFolderEmpty } from './is-folder-empty'
export { getOnline } from './is-online'
export { isWriteable } from './is-writeable'
export { validateNpmName } from './validate-pkg'
