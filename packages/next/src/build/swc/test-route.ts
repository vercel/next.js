/** Older NAPI bindings ignore appended arguments; never silently lose the route. */
export function requireTestRouteCapability(
  binding: { projectTestEntryRouteVersion?: () => number },
  route: string | undefined
): void {
  if (route === undefined) return
  const version = binding.projectTestEntryRouteVersion?.()
  if (!Number.isSafeInteger(version) || version! < 1) {
    throw new Error(
      'The installed Turbopack binding does not support native AppProject test routes'
    )
  }
}
