// the name of the export has to be the camelCase version of the file name (without the extension)
// TODO: remove this. We need it because using notFound from next/navigation imports this file :(
// During build with Turbopack, app-router-context is not available for Route Handlers,
// so we use a try-catch to handle the case when the module is not available during build
let appRouterContextModule: typeof import('../../../shared/lib/app-router-context.shared-runtime')

try {
  // Try to import app-router-context. During Turbopack build, this may fail
  // because the module is not available for Route Handlers.
  appRouterContextModule =
    require('../../../shared/lib/app-router-context.shared-runtime') as typeof import('../../../shared/lib/app-router-context.shared-runtime')
} catch {
  // If the module is not available (e.g., during Turbopack build), export an empty namespace.
  // Route Handlers don't actually need app-router-context, it's only exported because
  // notFound() from next/navigation imports this file.
  appRouterContextModule =
    {} as typeof import('../../../shared/lib/app-router-context.shared-runtime')
}

// Export as namespace to match the expected format
export { appRouterContextModule as appRouterContext }
