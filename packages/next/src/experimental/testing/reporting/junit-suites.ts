export interface ReportedJUnitSuiteTask {
  id: string
  name: string
  mode: 'run'
  state: 'fail'
  durationMs: number
  errors: { name: string; message: string; stack: string }[]
}
