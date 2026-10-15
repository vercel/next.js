import type { SerializedDiagnostic } from '../reporting/events'

/** A real custom provider owns its payload and report format, independently of V8. */
export interface CustomCoverageConfig {
  enabled: true
  provider: 'custom'
  customProviderModule: string
  clean: boolean
  reportsDirectory: string
  reportOnFailure: boolean
}
export interface CustomCoverageIdentity {
  file: string
  sha256: string
}
export interface CustomCoverageRequest {
  version: 1
  kind: 'custom'
  provider: CustomCoverageIdentity
  reportsDirectory: string
  /** Parent-owned payload storage survives file cache and worker disposal. */
  coverageFilesDirectory: string
}
export type CustomCoverageCompletion = {
  version: 1
  kind: 'custom'
  runId: string
  entryId: string
  revision: string
  provider: CustomCoverageIdentity
} & (
  | { complete: true; payload: unknown }
  | { complete: false; error: SerializedDiagnostic }
)
export interface CustomCoverageFact {
  completion: CustomCoverageCompletion
  testFiles: string[]
  environment: 'ssr'
  projectName?: string
}
export interface RuntimeCoverageModule {
  getProvider(): unknown | Promise<unknown>
  startCoverage(options: {
    isolate: true
    autoAttachSubprocess: false
    reportsDirectory: string
  }): unknown | Promise<unknown>
  takeCoverage(options: {
    coverageFilesDirectory: string
  }): unknown | Promise<unknown>
  stopCoverage(options: { isolate: true }): unknown | Promise<unknown>
}
export interface CustomCoverageProvider {
  name: string
  initialize(context: unknown): unknown | Promise<unknown>
  resolveOptions(): unknown
  clean(clean: boolean): unknown | Promise<unknown>
  onTestRunStart?(): unknown | Promise<unknown>
  onTestFailure?(): unknown | Promise<unknown>
  onAfterSuiteRun(
    meta: Omit<CustomCoverageFact, 'completion'> & {
      coverage: unknown
    }
  ): unknown | Promise<unknown>
  generateCoverage(context: {
    allTestsRun: boolean
  }): unknown | Promise<unknown>
  reportCoverage(
    coverage: unknown,
    context: {
      allTestsRun: boolean
    }
  ): unknown | Promise<unknown>
}
