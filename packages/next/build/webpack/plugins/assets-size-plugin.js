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
import promisify from '../../../lib/promisify'
import {
  IS_BUNDLED_PAGE_REGEX,
  BUILD_MANIFEST,
  REACT_LOADABLE_MANIFEST
} from 'next-server/constants'

const gzip = promisify(_gzip)

// This part is based on https://github.com/sindresorhus/pretty-bytes/blob/v5.1.0/index.js
// It's been edited for the needs of this script
// See the LICENSE at the top of the file
const UNITS = ['B', 'kB', 'MB']
const prettyBytes = number => {
  const exponent = Math.min(
    Math.floor(Math.log10(number) / 3),
    UNITS.length - 1
  )
  number = Number((number / Math.pow(1000, exponent)).toPrecision(3))
  const unit = UNITS[exponent]
  return number + ' ' + unit
}

export default class AssetsSizePlugin {
  constructor ({ buildId, distDir }) {
    this.buildId = buildId
    this.distDir = distDir ? pathRelative(process.cwd(), distDir) + '/' : ''
  }

  formatFilename (rawFilename) {
    // add distDir
    let filename = this.distDir + rawFilename

    // shorten buildId
    if (this.buildId) {
      filename = filename.replace(
        this.buildId + '/',
        this.buildId.substring(0, 4) + '****/'
      )
    }

    // shorten hashes
    filename = filename.replace(
      /(.*[-.])([0-9a-f]{8,})(\.js|\.css)/,
      (_, c1, hash, c2) => c1 + hash.substring(0, 4) + '****' + c2
    )

    return filename
  }

  async printAssetsSize (assets) {
    const sizes = await Promise.all(
      Object.keys(assets)
        .filter(
          filename =>
            filename !== REACT_LOADABLE_MANIFEST && filename !== BUILD_MANIFEST
        )
        .sort((a, b) => {
          // put pages at the top, then the rest
          const [pa, pb] = [a, b].map(x => IS_BUNDLED_PAGE_REGEX.exec(x))
          if (pa && !pb) return -1
          if (pb && !pa) return 1
          if (a > b) return 1
          return -1
        })
        .map(async filename => {
          const asset = assets[filename]
          const size = (await gzip(asset.source())).length

          return {
            filename,
            prettySize: prettyBytes(size)
          }
        })
    )

    // find longest prettySize string size
    const longestPrettySize = Math.max(
      ...sizes.map(({ prettySize }) => prettySize.length)
    )

    let message = '\nBrowser assets sizes after gzip:\n\n'

    for (let { filename, prettySize } of sizes) {
      const padding = ' '.repeat(longestPrettySize - prettySize.length)
      const formattedSize = prettySize
      const formattedFilename = this.formatFilename(filename)

      message += `   ${padding}${formattedSize}  ${formattedFilename}\n`
    }

    console.log(message)
  }

  async apply (compiler) {
    compiler.hooks.afterEmit.tapPromise('AssetsSizePlugin', compilation =>
      this.printAssetsSize(compilation.assets).catch(console.error)
    )
  }
}
