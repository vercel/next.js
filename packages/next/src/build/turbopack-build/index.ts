export function turbopackBuild(
  withWorker: boolean
): ReturnType<typeof import('./impl').turbopackBuild> {
  if (withWorker) {
    throw new Error('TODO')
  } else {
    const build = (require('./impl') as typeof import('./impl')).turbopackBuild
    return build()
  }
}
