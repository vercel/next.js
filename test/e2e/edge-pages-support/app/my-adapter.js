module.exports = {
  onBuildComplete({ outputs }) {
    const duplicateIds = new Set()
    const seenIds = new Set()
    for (const output of outputs.pages) {
      if (seenIds.has(output.id)) {
        duplicateIds.add(output.id)
      } else {
        seenIds.add(output.id)
      }
    }

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
    const hasDataPathWithDifferentId = outputs.pages.some(
      (item) =>
        item.pathname.startsWith('/_next/data/') && item.id !== item.pathname
    )

    if (!hasIndexData || !hasDynamicData || hasDoubleIndexData) {
      throw new Error(
        [
          'Unexpected edge pages data output from adapter build:',
          `pagesDataPathnames=${JSON.stringify(pagesDataPathnames)}`,
          `appPagesDataPathnames=${JSON.stringify(appPagesDataPathnames)}`,
          `hasIndexData=${hasIndexData}`,
          `hasDynamicData=${hasDynamicData}`,
          `hasDoubleIndexData=${hasDoubleIndexData}`,
          `hasDataPathWithDifferentId=${hasDataPathWithDifferentId}`,
          `duplicateIds=${JSON.stringify(Array.from(duplicateIds))}`,
        ].join('\n')
      )
    }

    if (appPagesDataPathnames.length > 0) {
      throw new Error(
        `Expected no pages-router data outputs in appPages: ${JSON.stringify(appPagesDataPathnames)}`
      )
    }
    if (hasDataPathWithDifferentId) {
      throw new Error(
        `Expected pages-router _next/data outputs to use pathname as id: ${JSON.stringify(outputs.pages.filter((item) => item.pathname.startsWith('/_next/data/')))}`
      )
    }
    if (duplicateIds.size > 0) {
      throw new Error(
        `Expected unique output ids, found duplicates: ${JSON.stringify(Array.from(duplicateIds))}`
      )
    }
  },
}
