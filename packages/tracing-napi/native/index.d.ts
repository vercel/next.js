export interface NapiNftResult {
  files: Array<string>
  issues: Array<string>
}

export declare function nodeFileTrace(
  projectRoot: string,
  cwd: string,
  outputBase: string,
  input: Array<string>,
  graph: boolean,
  showIssues: boolean,
  maxDepth?: number | undefined | null
): Promise<NapiNftResult>
