import { nextTestSetup, type NextInstance } from 'e2e-utils'
import { join } from 'path'

describe('Basic Global Support', () => {
  describe('without lightningcss', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'single-global'),
      nextConfig: {
        productionBrowserSourceMaps: true,
      },
    })

    it(`should've emitted a single CSS file`, async () => {
      await assertSingleGlobalCss(next, false, isTurbopack)
    })
  })

  describe('with lightningcss', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'single-global'),
      nextConfig: {
        productionBrowserSourceMaps: true,
        experimental: {
          useLightningcss: true,
        },
      },
    })

    it(`should've emitted a single CSS file`, async () => {
      await assertSingleGlobalCss(next, true, isTurbopack)
    })
  })
})

describe('Basic Global Support with special characters in path', () => {
  describe('without lightningcss', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(
        __dirname,
        'fixtures',
        'single-global-special-characters',
        'a+b'
      ),
      nextConfig: {
        productionBrowserSourceMaps: true,
      },
    })

    it(`should've emitted a single CSS file`, async () => {
      await assertSingleGlobalCss(next, false, isTurbopack)
    })
  })

  describe('with lightningcss', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(
        __dirname,
        'fixtures',
        'single-global-special-characters',
        'a+b'
      ),
      nextConfig: {
        productionBrowserSourceMaps: true,
        experimental: {
          useLightningcss: true,
        },
      },
    })

    it(`should've emitted a single CSS file`, async () => {
      await assertSingleGlobalCss(next, true, isTurbopack)
    })
  })
})

describe('Basic Global Support with src/ dir', () => {
  describe('without lightningcss', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'single-global-src'),
      nextConfig: {
        productionBrowserSourceMaps: true,
      },
    })

    it(`should've emitted a single CSS file`, async () => {
      await assertSingleGlobalCss(next, false, isTurbopack)
    })
  })

  describe('with lightningcss', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'single-global-src'),
      nextConfig: {
        productionBrowserSourceMaps: true,
        experimental: {
          useLightningcss: true,
        },
      },
    })

    it(`should've emitted a single CSS file`, async () => {
      await assertSingleGlobalCss(next, true, isTurbopack)
    })
  })
})

describe('Multi Global Support', () => {
  describe('without lightningcss', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'multi-global'),
      nextConfig: {
        productionBrowserSourceMaps: true,
      },
    })

    it(`should've emitted a single CSS file`, async () => {
      await assertMultiGlobalCss(next, false, isTurbopack)
    })
  })

  describe('with lightningcss', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'multi-global'),
      nextConfig: {
        productionBrowserSourceMaps: true,
        experimental: {
          useLightningcss: true,
        },
      },
    })

    it(`should've emitted a single CSS file`, async () => {
      await assertMultiGlobalCss(next, true, isTurbopack)
    })
  })
})

describe('Nested @import() Global Support', () => {
  describe('without lightningcss', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'nested-global'),
      nextConfig: {
        productionBrowserSourceMaps: true,
      },
    })

    it(`should've emitted a single CSS file`, async () => {
      await assertNestedGlobalCss(next, false, isTurbopack)
    })
  })

  describe('with lightningcss', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'nested-global'),
      nextConfig: {
        productionBrowserSourceMaps: true,
        experimental: {
          useLightningcss: true,
        },
      },
    })

    it(`should've emitted a single CSS file`, async () => {
      await assertNestedGlobalCss(next, true, isTurbopack)
    })
  })
})

describe('Multi Global Support (reversed)', () => {
  describe('without lightningcss', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'multi-global-reversed'),
      nextConfig: {
        productionBrowserSourceMaps: true,
      },
    })

    it(`should've emitted a single CSS file`, async () => {
      await assertMultiGlobalReversedCss(next, false, isTurbopack)
    })
  })

  describe('with lightningcss', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'multi-global-reversed'),
      nextConfig: {
        productionBrowserSourceMaps: true,
        experimental: {
          useLightningcss: true,
        },
      },
    })

    it(`should've emitted a single CSS file`, async () => {
      await assertMultiGlobalReversedCss(next, true, isTurbopack)
    })
  })
})

describe('CSS URL via `file-loader`', () => {
  describe('without lightningcss', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'url-global'),
      nextConfig: {
        productionBrowserSourceMaps: true,
      },
    })

    it(`should've emitted expected files`, async () => {
      await assertUrlGlobalCss(next, false, isTurbopack)
    })
  })

  describe('with lightningcss', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'url-global'),
      nextConfig: {
        productionBrowserSourceMaps: true,
        experimental: {
          useLightningcss: true,
        },
      },
    })

    it(`should've emitted expected files`, async () => {
      await assertUrlGlobalCss(next, true, isTurbopack)
    })
  })
})

describe('CSS URL via `file-loader` and asset prefix (1)', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'url-global-asset-prefix-1'),
  })

  it(`should've emitted expected files`, async () => {
    const $ = await next.render$('/')

    const cssSheet = $('link[rel="stylesheet"]')
    const cssContent = await getStylesheetContents(next, cssSheet)

    if (isTurbopack) {
      expect(cssContent).toMatchInlineSnapshot(`
       [
         "/_next/static/immutable/chunks/HASH.css:
       .red-text{color:red;background-image:url(../media/dark.0-9yl04ewdb5w.svg) url(../media/dark2.0-9yl04ewdb5w.svg)}
       .blue-text{color:orange;background-image:url(../media/light.37p36_ay21lu_.svg);font-weight:bolder}
       .blue-text{color:#00f}",
       ]
      `)
    } else {
      expect(cssContent).toMatchInlineSnapshot(`
       [
         "/_next/static/css/HASH.css:
       .red-text{color:red;background-image:url(/foo/_next/static/media/dark.6b01655b.svg) url(/foo/_next/static/media/dark2.6b01655b.svg)}.blue-text{color:orange;font-weight:bolder;background-image:url(/foo/_next/static/media/light.2da1d3d6.svg);color:blue}",
       ]
      `)
    }
  })
})

describe('CSS URL via `file-loader` and asset prefix (2)', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'url-global-asset-prefix-2'),
  })

  it(`should've emitted expected files`, async () => {
    const $ = await next.render$('/')

    const cssSheet = $('link[rel="stylesheet"]')
    const cssContent = await getStylesheetContents(next, cssSheet)

    if (isTurbopack) {
      expect(cssContent).toMatchInlineSnapshot(`
       [
         "/_next/static/immutable/chunks/HASH.css:
       .red-text{color:red;background-image:url(../media/dark.0-9yl04ewdb5w.svg) url(../media/dark2.0-9yl04ewdb5w.svg)}
       .blue-text{color:orange;background-image:url(../media/light.37p36_ay21lu_.svg);font-weight:bolder}
       .blue-text{color:#00f}",
       ]
      `)
    } else {
      expect(cssContent).toMatchInlineSnapshot(`
       [
         "/_next/static/css/HASH.css:
       .red-text{color:red;background-image:url(/foo/_next/static/media/dark.6b01655b.svg) url(/foo/_next/static/media/dark2.6b01655b.svg)}.blue-text{color:orange;font-weight:bolder;background-image:url(/foo/_next/static/media/light.2da1d3d6.svg);color:blue}",
       ]
      `)
    }
  })
})

async function getStylesheetContents(
  next: NextInstance,
  items: {
    length: number
    eq: (i: number) => { attr: (name: string) => string | undefined }
  }
): Promise<string[]> {
  const results: string[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items.eq(i)
    const href = (item.attr('href') ?? '').replace(/^\/foo\//, '/')
    const res = await next.fetch(href)
    if (res.status !== 200)
      throw new Error(`Failed to load stylesheet: ${href}`)
    const pathname = new URL(href, next.url).pathname
    const text = await res.text()
    results.push(
      `${pathname.replace(/\/([0-9a-z_-]{7,})\.(css|js)\b/g, '/HASH.$2')}:\n${text
        .replace(/\/\*.*?\*\/\n?/g, '')
        .replace(/(\?dpl=[^)"']+)/g, '')
        .trim()}`
    )
  }
  return results
}

async function assertSingleGlobalCss(
  next: NextInstance,
  useLightningcss: boolean,
  isTurbopack: boolean
) {
  const $ = await next.render$('/')

  const cssSheet = $('link[rel="stylesheet"]')
  const cssContent = await getStylesheetContents(next, cssSheet)

  if (isTurbopack && useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/immutable/chunks/HASH.css:
     .red-text{color:red}",
     ]
    `)
  } else if (isTurbopack && !useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/immutable/chunks/HASH.css:
     .red-text{color:red}",
     ]
    `)
  } else if (useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/css/HASH.css:
     .red-text{color:red}",
     ]
    `)
  } else {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/css/HASH.css:
     .red-text{color:red}",
     ]
    `)
  }
}

async function assertMultiGlobalCss(
  next: NextInstance,
  useLightningcss: boolean,
  isTurbopack: boolean
) {
  const $ = await next.render$('/')

  const cssSheet = $('link[rel="stylesheet"]')
  const cssContent = await getStylesheetContents(next, cssSheet)

  if (isTurbopack && useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/immutable/chunks/HASH.css:
     .red-text{color:red}
     .blue-text{color:#00f}",
     ]
    `)
  } else if (isTurbopack && !useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/immutable/chunks/HASH.css:
     .red-text{color:red}
     .blue-text{color:#00f}",
     ]
    `)
  } else if (useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/css/HASH.css:
     .red-text{color:red}.blue-text{color:#00f}",
     ]
    `)
  } else {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/css/HASH.css:
     .red-text{color:red}.blue-text{color:blue}",
     ]
    `)
  }
}

async function assertNestedGlobalCss(
  next: NextInstance,
  useLightningcss: boolean,
  isTurbopack: boolean
) {
  const $ = await next.render$('/')

  const cssSheet = $('link[rel="stylesheet"]')
  const cssContent = await getStylesheetContents(next, cssSheet)

  if (isTurbopack && useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/immutable/chunks/HASH.css:
     .red-text{color:purple;font-weight:bolder}
     .red-text{color:red}
     .blue-text{color:orange;font-weight:bolder}
     .blue-text{color:#00f}",
     ]
    `)
  } else if (isTurbopack && !useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/immutable/chunks/HASH.css:
     .red-text{color:purple;font-weight:bolder}
     .red-text{color:red}
     .blue-text{color:orange;font-weight:bolder}
     .blue-text{color:#00f}",
     ]
    `)
  } else if (process.env.NEXT_RSPACK && useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/css/HASH.css:
     .red-text{color:red;font-weight:bolder}.blue-text{color:#00f;font-weight:bolder}",
     ]
    `)
  } else if (useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/css/HASH.css:
     .red-text{color:purple;font-weight:bolder;color:red}.blue-text{color:orange;font-weight:bolder;color:#00f}",
     ]
    `)
  } else {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/css/HASH.css:
     .red-text{color:purple;font-weight:bolder;color:red}.blue-text{color:orange;font-weight:bolder;color:blue}",
     ]
    `)
  }
}

async function assertMultiGlobalReversedCss(
  next: NextInstance,
  useLightningcss: boolean,
  isTurbopack: boolean
) {
  const $ = await next.render$('/')

  const cssSheet = $('link[rel="stylesheet"]')
  const cssContent = await getStylesheetContents(next, cssSheet)

  if (isTurbopack && useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/immutable/chunks/HASH.css:
     .blue-text{color:#00f}
     .red-text{color:red}",
     ]
    `)
  } else if (isTurbopack && !useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/immutable/chunks/HASH.css:
     .blue-text{color:#00f}
     .red-text{color:red}",
     ]
    `)
  } else if (useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/css/HASH.css:
     .blue-text{color:#00f}.red-text{color:red}",
     ]
    `)
  } else {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/css/HASH.css:
     .blue-text{color:blue}.red-text{color:red}",
     ]
    `)
  }
}

async function assertUrlGlobalCss(
  next: NextInstance,
  useLightningcss: boolean,
  isTurbopack: boolean
) {
  const $ = await next.render$('/')

  const cssSheet = $('link[rel="stylesheet"]')
  const cssContent = await getStylesheetContents(next, cssSheet)

  if (isTurbopack && useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/immutable/chunks/HASH.css:
     .red-text{color:red;background-image:url(../media/dark.0-9yl04ewdb5w.svg),url(../media/dark2.0-9yl04ewdb5w.svg)}
     .blue-text{color:orange;background-image:url(../media/light.37p36_ay21lu_.svg);font-weight:bolder}
     .blue-text{color:#00f}",
     ]
    `)
  } else if (isTurbopack && !useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/immutable/chunks/HASH.css:
     .red-text{color:red;background-image:url(../media/dark.0-9yl04ewdb5w.svg),url(../media/dark2.0-9yl04ewdb5w.svg)}
     .blue-text{color:orange;background-image:url(../media/light.37p36_ay21lu_.svg);font-weight:bolder}
     .blue-text{color:#00f}",
     ]
    `)
  } else if (process.env.NEXT_RSPACK && useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/css/HASH.css:
     .red-text{color:red;background-image:url(/_next/static/media/dark.6b01655b.svg),url(/_next/static/media/dark2.6b01655b.svg)}.blue-text{color:#00f;background-image:url(/_next/static/media/light.2da1d3d6.svg);font-weight:bolder}",
     ]
    `)
  } else if (useLightningcss) {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/css/HASH.css:
     .red-text{color:red;background-image:url(/_next/static/media/dark.6b01655b.svg),url(/_next/static/media/dark2.6b01655b.svg)}.blue-text{color:orange;background-image:url(/_next/static/media/light.2da1d3d6.svg);font-weight:bolder;color:#00f}",
     ]
    `)
  } else {
    expect(cssContent).toMatchInlineSnapshot(`
     [
       "/_next/static/css/HASH.css:
     .red-text{color:red;background-image:url(/_next/static/media/dark.6b01655b.svg),url(/_next/static/media/dark2.6b01655b.svg)}.blue-text{color:orange;font-weight:bolder;background-image:url(/_next/static/media/light.2da1d3d6.svg);color:blue}",
     ]
    `)
  }
}
