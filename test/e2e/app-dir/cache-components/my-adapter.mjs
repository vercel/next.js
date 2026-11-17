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

    // App functions are emitted once. Routing rules route `.rsc` requests to
    // the function, so no function output has an `.rsc` pathname.
    for (const output of [...ctx.outputs.appPages, ...ctx.outputs.appRoutes]) {
      if (output.pathname.endsWith('.rsc')) {
        validationErrors.push(
          `App function ${output.pathname} must not have an .rsc pathname`
        )
      }
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
