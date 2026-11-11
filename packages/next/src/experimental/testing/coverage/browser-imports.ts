type Point = { line: number; column: number }

export type BrowserImportStatement = { start: Point; count: number }

export type BrowserClassicFactory = {
  binding: string
  moduleStart: number
  moduleEnd: number
  namedPragma?: {
    local: string
    start: Point
    end: Point
    fragment?: { local: string; start: Point; end: Point }
  }
}

export type BrowserPromiseConstructor = {
  binding: string
  moduleStart: number
  moduleEnd: number
}

export type BrowserAutomaticFactory = {
  binding: string
  moduleStart: number
  moduleEnd: number
  imports: readonly string[]
}
