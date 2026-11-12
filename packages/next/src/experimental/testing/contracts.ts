/** Requested Next compilation context, not a replacement compiler configuration. */
export interface TestProfile {
  id: string
  mode: 'development' | 'production'
  environment: 'node' | 'rsc' | 'browser'
  runtime: 'nodejs'
  bundler: 'turbopack'
  route?: string
  /** Explicit actual-client Browser Mode; ordinary browser drivers omit this. */
  browserClient?: true
}

/** Process execution realm; does not alter the Next compiler condition set. */
export interface TestExecutionEnvironment {
  name: string
  options?: Record<string, unknown>
}

export interface TestEntry {
  /** Authored project label; compilation identity remains profile.id. */
  projectName?: string
  /** Current-file import.meta.vitest marker requires native substitution. */
  inSource?: true
  /** Exact raw source bytes from marker discovery. */
  inSourceHash?: string
  executionEnvironment?: TestExecutionEnvironment
  /** Binds the discovered file pragmas to the compiler's exact source bytes. */
  environmentSourceHash?: string
  /** Collected and checked by TypeScript, never evaluated as a runtime entry. */
  typecheck?: true
  /** Stable identity combining project/profile name and project-relative path. */
  id: string
  /** Absolute source filename. */
  file: string
  profile: TestProfile
}
