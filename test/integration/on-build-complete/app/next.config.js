const fs = require('fs-extra')
const { join } = require('path')

const testOutputFilename = join(__dirname, 'test-output-page-infos.json')

module.exports = {
  onBuildComplete: ({ pageInfos }) => {
    /**
     * @example
     * demonstrate inspecting page size datas
     * ```js
     * for (const [pageName, pageInfo] of pageInfos.entries()) {
     *   console.log(pageInfo.totalSize)
     * }
     * ```
     */
    return fs.writeFile(testOutputFilename, JSON.stringify(pageInfos))
  },
}
