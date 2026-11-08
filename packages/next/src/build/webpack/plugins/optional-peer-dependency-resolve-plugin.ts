import type { Resolver } from 'webpack'

const pluginSymbol = Symbol('OptionalPeerDependencyResolverPlugin')

export class OptionalPeerDependencyResolverPlugin {
  apply(resolver: Resolver) {
    const target = resolver.ensureHook('raw-module')
    target.tapAsync(
      'OptionalPeerDependencyResolverPlugin',
      (request, resolveContext, callback) => {
        // if we've already recursed into this plugin, we want to skip it
        if ((request as any)[pluginSymbol]) {
          return callback()
        }

        // Pop the stack to prevent the recursion check. Webpack's bundled
        // resolver exposes a Set while external resolver versions can expose
        // a stack with a pop method.
        if (resolveContext.stack) {
          const stack = resolveContext.stack as typeof resolveContext.stack & {
            pop?: () => unknown
          }
          if (typeof stack.delete === 'function') {
            stack.delete(Array.from(stack).pop()!)
          } else {
            stack.pop?.()
          }
        }

        resolver.doResolve(
          target,
          // when we call doResolve again, we need to make sure we don't
          // recurse into this plugin again
          { ...request, [pluginSymbol]: true } as any,
          null,
          resolveContext,
          (err, result) => {
            if (
              !result &&
              request?.descriptionFileData?.peerDependenciesMeta &&
              request.request
            ) {
              const peerDependenciesMeta = request.descriptionFileData
                .peerDependenciesMeta as Record<string, { optional?: boolean }>

              const isOptional =
                peerDependenciesMeta &&
                peerDependenciesMeta[request.request] &&
                peerDependenciesMeta[request.request].optional

              if (isOptional) {
                return callback(null, {
                  path: false,
                })
              }
            }

            return callback(err, result)
          }
        )
      }
    )
  }
}
