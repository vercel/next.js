export type StyledString =
  | {
      type: 'text'
      value: string
    }
  | {
      type: 'code'
      value: string
    }
  | {
      type: 'strong'
      value: string
    }
  | {
      type: 'stack'
      value: StyledString[]
    }
  | {
      type: 'line'
      value: StyledString[]
    }

export interface Issue {
  severity: string
  stage: string
  filePath: string
  title: StyledString
  description?: StyledString
  detail?: StyledString
  source?: {
    source: {
      ident: string
      content?: string
    }
    range?: {
      start: {
        // 0-indexed
        line: number
        // 0-indexed
        column: number
      }
      end: {
        // 0-indexed
        line: number
        // 0-indexed
        column: number
      }
    }
  }
  documentationLink: string
  subIssues: Issue[]
}

export interface Diagnostics {
  category: string
  name: string
  payload: unknown
}

export type TurbopackResult<T = {}> = T & {
  issues: Issue[]
  diagnostics: Diagnostics[]
}
