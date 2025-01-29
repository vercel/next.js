export function turbopackBuild(
  withWorker: boolean
): ReturnType<typeof import('./impl').turbopackBuild> {
  if (withWorker) {
    // TODO implement worker in follow-up PR.
    const build = (require('./impl') as typeof import('./impl')).turbopackBuild
    return build()
  } else {
    const build = (require('./impl') as typeof import('./impl')).turbopackBuild
    return build()
  }
}
