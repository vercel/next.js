import {
  DevPagesBundlePathNormalizer,
  PagesBundlePathNormalizer,
} from './pages-bundle-path-normalizer'
import { PagesFilenameNormalizer } from './pages-filename-normalizer'
import { DevPagesPageNormalizer } from './pages-page-normalizer'
import { DevPagesPathnameNormalizer } from './pages-pathname-normalizer'

export class PagesNormalizers {
  public readonly filename: PagesFilenameNormalizer
  public readonly bundlePath: PagesBundlePathNormalizer

  constructor(distDir: string) {
    this.filename = new PagesFilenameNormalizer(distDir)
    this.bundlePath = new PagesBundlePathNormalizer()

    // You'd think that we'd require a `pathname` normalizer here, but for
    // `/pages` we have to handle i18n routes, which means that we need to
    // analyze the page path to determine the locale prefix and it's locale.
  }
}

export class DevPagesNormalizers {
  public readonly page: DevPagesPageNormalizer
  public readonly pathname: DevPagesPathnameNormalizer
  public readonly bundlePath: DevPagesBundlePathNormalizer

  constructor(pagesDir: string, extensions: ReadonlyArray<string>) {
    this.page = new DevPagesPageNormalizer(pagesDir, extensions)
    this.pathname = new DevPagesPathnameNormalizer(pagesDir, extensions)
    this.bundlePath = new DevPagesBundlePathNormalizer(this.page)
  }
}
