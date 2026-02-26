module.exports = {
  onBuildComplete({ outputs }) {
    const pagesDataPathnames = outputs.pages
      .map((item) => item.pathname)
      .filter((item) => item.startsWith('/_next/data/'))
    const appPagesDataPathnames = outputs.appPages
      .map((item) => item.pathname)
      .filter((item) => item.startsWith('/_next/data/'))

    const hasIndexData = pagesDataPathnames.some((item) =>
      /^\/_next\/data\/[^/]+\/index\.json$/.test(item)
    )
    const hasDynamicData = pagesDataPathnames.some((item) =>
      /^\/_next\/data\/[^/]+\/\[id\]\.json$/.test(item)
    )
    const hasDoubleIndexData = [
      ...pagesDataPathnames,
      ...appPagesDataPathnames,
    ].some((item) => /^\/_next\/data\/[^/]+\/index\/index\.json$/.test(item))

    if (!hasIndexData || !hasDynamicData || hasDoubleIndexData) {
      throw new Error(
        [
          'Unexpected edge pages data output from adapter build:',
          `pagesDataPathnames=${JSON.stringify(pagesDataPathnames)}`,
          `appPagesDataPathnames=${JSON.stringify(appPagesDataPathnames)}`,
          `hasIndexData=${hasIndexData}`,
          `hasDynamicData=${hasDynamicData}`,
          `hasDoubleIndexData=${hasDoubleIndexData}`,
        ].join('\n')
      )
    }

    if (appPagesDataPathnames.length > 0) {
      throw new Error(
        `Expected no pages-router data outputs in appPages: ${JSON.stringify(appPagesDataPathnames)}`
      )
    }
  },
}
