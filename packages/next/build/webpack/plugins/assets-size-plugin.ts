// Some parts of this file are licensed under the following :
/**
MIT License

Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import { gzip as _gzip } from 'zlib'
import { relative as pathRelative } from 'path'
import { Compiler } from 'webpack'
import promisify from '../../../lib/promisify'
import { IS_BUNDLED_PAGE_REGEX, ROUTE_NAME_REGEX } from 'next-server/constants'

const gzip = promisify(_gzip)

// This part is based on https://github.com/sindresorhus/pretty-bytes/blob/v5.1.0/index.js
// It's been edited for the needs of this script
// See the LICENSE at the top of the file
const UNITS = ['B', 'kB', 'MB']
function prettyBytes(number: number): string {
  const exponent = Math.min(
    Math.floor(Math.log10(number) / 3),
    UNITS.length - 1
  )
  number = Number((number / Math.pow(1000, exponent)).toPrecision(3))
  const unit = UNITS[exponent]
  return number + ' ' + unit
}

export default class AssetsSizePlugin {
  buildId: string
  distDir: string

  constructor(buildId: string, distDir: string) {
    this.buildId = buildId
    this.distDir = distDir ? pathRelative(process.cwd(), distDir) + '/' : ''
  }

  async printAssetsSize(assets: any) {
    const sizes = await Promise.all(
      Object.keys(assets)
        .filter(filename => IS_BUNDLED_PAGE_REGEX.exec(filename))
        .map(async filename => {
          const search = filename.match(ROUTE_NAME_REGEX)
          let page = search ? search[1] : filename
          if (page.slice(-5) === 'index') {
            page = page.slice(0, -5)
          }
          const asset = assets[filename]
          const size = (await gzip(asset.source())).length

          return {
            filename,
            page,
            prettySize: prettyBytes(size)
          }
        })
    )

    sizes.sort((a, b) => {
      if (a.page > b.page) return 1
      return -1
    })

    let message = '\nPages sizes after gzip:\n\n'

    for (let i = 0; i < sizes.length; i++) {
      const size = sizes[i]
      const corner =
        i === 0
          ? sizes.length === 1
            ? '─'
            : '┌'
          : i === sizes.length - 1
          ? '└'
          : '├'
      message += `${corner} /${size.page} (${size.prettySize})\n`
    }

    console.log(message)
  }

  async apply(compiler: Compiler) {
    compiler.hooks.afterEmit.tapPromise('AssetsSizePlugin', compilation =>
      this.printAssetsSize(compilation.assets).catch(console.error)
    )
  }
}
