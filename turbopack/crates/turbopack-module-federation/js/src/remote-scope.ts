/**
 * Carries Webpack's optional `getScope` value while a container starts an exposed-module load.
 *
 * `container.get("./Button", scope)` sets this value only while it invokes the generated loader.
 * If that loader immediately requests another remote, the remote loader can pass the same scope
 * along and avoid re-entering a container already being visited.
 */
let currentRemoteGetScope: unknown

export function getCurrentRemoteGetScope(): unknown {
  return currentRemoteGetScope
}

export function setCurrentRemoteGetScope(scope: unknown): unknown {
  const previous = currentRemoteGetScope
  currentRemoteGetScope = scope
  return previous
}
