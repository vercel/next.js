import {
  AppBundlePathNormalizer,
  DevAppBundlePathNormalizer,
} from './app-bundle-path-normalizer'
import { AppFilenameNormalizer } from './app-filename-normalizer'
import { DevAppPageNormalizer } from './app-page-normalizer'
import {
  AppPathnameNormalizer,
  DevAppPathnameNormalizer,
} from './app-pathname-normalizer'

export class AppNormalizers {
  public readonly filename: AppFilenameNormalizer
  public readonly pathname: AppPathnameNormalizer
  public readonly bundlePath: AppBundlePathNormalizer

  constructor(distDir: string) {
    this.filename = new AppFilenameNormalizer(distDir)
    this.pathname = new AppPathnameNormalizer()
    this.bundlePath = new AppBundlePathNormalizer()
  }
}

export class DevAppNormalizers {
  public readonly page: DevAppPageNormalizer
  public readonly pathname: DevAppPathnameNormalizer
  public readonly bundlePath: DevAppBundlePathNormalizer

  constructor(
    appDir: string,
    extensions: ReadonlyArray<string>,
    isTurbopack: boolean
  ) {
    this.page = new DevAppPageNormalizer(appDir, extensions, isTurbopack)
    this.pathname = new DevAppPathnameNormalizer(this.page)
    this.bundlePath = new DevAppBundlePathNormalizer(this.page, isTurbopack)
  }
}
