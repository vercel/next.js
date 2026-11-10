import 'loader-runner'

declare module 'loader-runner' {
  // @types/loader-runner is out of date and omits missingDependencies.
  interface RunLoaderResult {
    missingDependencies: string[]
  }
}
