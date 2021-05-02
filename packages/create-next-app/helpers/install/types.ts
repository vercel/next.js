import { NextCreateOptions } from '../../create-app'
import { RepoInfo } from '../examples'
import { ExampleInfoContext } from '../get-example-info'

export type OutputMode = 'ts' | 'js'

export interface InstallExampleContext extends ExampleInfoContext {
  example?: string
  repoInfo?: RepoInfo
  root: string
  template: string
  outputMode: OutputMode
  installFlags: PackageManagerFlags
}

export interface InstallTemplateContext extends InstallExampleContext {
  appName: string
  options: NextCreateOptions
}

export interface PackageManagerFlags {
  /**
   * Indicate whether to install packages using Yarn.
   */
  useYarn: boolean
  /**
   * Indicate whether there is an active Internet connection.
   */
  isOnline: boolean
  /**
   * Indicate whether the given dependencies are devDependencies.
   */
  devDependencies?: boolean
}

export class DownloadError extends Error {}
