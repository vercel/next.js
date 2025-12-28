/**
 * This adapter is not modifying outputs or the test
 * it is just adding additional assertions ensuring
 * we provide the expected outputs and file paths are valid
 */
import fs from 'fs'

// @ts-check
/** @type {import('next').NextAdapter } */
const myAdapter = {
  name: 'my-custom-adapter',
  modifyConfig: (config, { phase }) => {
    if (process.env.NODE_ENV !== 'production') return config
    if (typeof phase !== 'string') {
      throw new Error(`invalid phase value provided to modifyConfig ${phase}`)
    }
    console.log('called modify config in adapter with phase', phase)
    return config
  },
  onBuildComplete: async (ctx) => {
    console.log('onBuildComplete called')

    // Validate all output file paths exist on the filesystem
    const allOutputs = [
      ...ctx.outputs.pages,
      ...ctx.outputs.pagesApi,
      ...ctx.outputs.appPages,
      ...ctx.outputs.appRoutes,
      ...ctx.outputs.prerenders,
      ...ctx.outputs.staticFiles,
    ]

    if (ctx.outputs.middleware) {
      allOutputs.push(ctx.outputs.middleware)
    }

    const validationErrors = []

    // Check that all filePaths in outputs exist
    for (const output of allOutputs) {
      if (output.filePath) {
        try {
          await fs.promises.access(output.filePath, fs.constants.F_OK)
        } catch (err) {
          validationErrors.push(
            `Missing file for output ${output.id}: ${output.filePath}`
          )
        }
      }

      // Check fallback filePath for prerenders
      if (output.type === 'PRERENDER' && output.fallback) {
        if (output.fallback.filePath) {
          try {
            await fs.promises.access(
              output.fallback.filePath,
              fs.constants.F_OK
            )
          } catch (err) {
            validationErrors.push(
              `Missing fallback file for prerender ${output.id}: ${JSON.stringify(output, null, 2)}`
            )
          }
        } else if (!output.fallback.postponedState) {
          throw new Error(
            `Missing postponed state or filePath for prerender ${output.id} ${JSON.stringify(output, null, 2)}`
          )
        }
      }

      // Check assets
      if (output.assets) {
        for (const [key, assetPath] of Object.entries(output.assets)) {
          try {
            await fs.promises.access(assetPath, fs.constants.F_OK)
          } catch (err) {
            validationErrors.push(
              `Missing asset file for output ${output.id} (${key}): ${assetPath}`
            )
          }
        }
      }

      // Check wasmAssets
      if (output.wasmAssets) {
        for (const [key, wasmPath] of Object.entries(output.wasmAssets)) {
          try {
            await fs.promises.access(wasmPath, fs.constants.F_OK)
          } catch (err) {
            validationErrors.push(
              `Missing wasm file for output ${output.id} (${key}): ${wasmPath}`
            )
          }
        }
      }
    }

    // Validate that segment routes are present in routing.dynamicRoutes
    // Segment routes match the pattern: .segments/.+.segment.rsc
    const segmentRoutes = ctx.routing.dynamicRoutes.filter((route) => {
      // Check if the source or destination contains segment routes
      return (
        route.sourceRegex.includes('.segments/') ||
        route.sourceRegex.includes('.segment.rsc')
      )
    })

    // Ensure we have segment routes when we have app pages
    if (ctx.outputs.appPages.length > 0) {
      if (segmentRoutes.length === 0) {
        validationErrors.push(
          'Expected segment routes in routing.dynamicRoutes when app pages exist'
        )
      } else {
        console.log(
          `Found ${segmentRoutes.length} segment routes in routing.dynamicRoutes`
        )
      }
    }

    // Validate that all appPages have matching .rsc and non .rsc pathnames
    const appPagePathnames = new Map()
    for (const appPage of ctx.outputs.appPages) {
      const pathname = appPage.pathname
      if (pathname.endsWith('.rsc')) {
        const basePathname = pathname.slice(0, -4) // Remove .rsc extension
        if (!appPagePathnames.has(basePathname)) {
          appPagePathnames.set(basePathname, { rsc: false, nonRsc: false })
        }
        appPagePathnames.get(basePathname).rsc = true
      } else {
        if (!appPagePathnames.has(pathname)) {
          appPagePathnames.set(pathname, { rsc: false, nonRsc: false })
        }
        appPagePathnames.get(pathname).nonRsc = true
      }
    }

    // Check that each pathname has both .rsc and non .rsc versions
    for (const [pathname, versions] of appPagePathnames.entries()) {
      if (!versions.rsc) {
        validationErrors.push(
          `App page ${pathname} is missing corresponding .rsc pathname`
        )
      }
      if (!versions.nonRsc) {
        validationErrors.push(
          `App page ${pathname}.rsc is missing corresponding non .rsc pathname`
        )
      }
    }

    if (appPagePathnames.size > 0) {
      console.log(
        `Validated ${appPagePathnames.size} app page pathname(s) have matching .rsc and non .rsc versions`
      )
    }

    if (validationErrors.length > 0) {
      console.error('Validation errors:')
      for (const error of validationErrors) {
        console.error(`  - ${error}`)
      }
      throw new Error(
        `Adapter validation failed with ${validationErrors.length} error(s)`
      )
    }

    console.log('Validation passed: All output files exist on filesystem')
    console.log(
      `Segment routes validated: ${segmentRoutes.length} routes found`
    )

    await fs.promises.writeFile(
      'build-complete.json',
      JSON.stringify(ctx, null, 2)
    )
  },
}

export default myAdapter
