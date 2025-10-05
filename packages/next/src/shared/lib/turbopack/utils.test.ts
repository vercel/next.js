import type {
  Issue,
  PlainTraceItem,
  StyledString,
} from '../../../build/swc/types'
import { formatIssue } from './utils'

function styledText(value: string): StyledString {
  return { type: 'text', value }
}

function traceItem(path: string, layer?: string): PlainTraceItem {
  return {
    fsName: 'project',
    path,
    layer,
    rootPath: '',
  }
}
describe('formatIssue', () => {
  const baseIssue: Omit<Issue, 'importTraces'> = {
    severity: 'error',
    filePath: '[project]/src/app/page.ts',
    title: styledText('Module not found'),
    source: undefined,
    documentationLink: 'https://nextjs.org/docs',
    stage: 'resolve',
  }

  it('formats a single import trace', () => {
    const trace: PlainTraceItem[] = [
      traceItem('src/app/page.ts', 'client'),
      traceItem('src/lib/foo.ts', 'client'),
    ]
    const issue: Issue = {
      ...baseIssue,
      importTraces: [trace],
    }
    const output = formatIssue(issue)
    expect(output).toBe(`\
./src/app/page.ts
Module not found
Import trace:
  client:
    ./src/app/page.ts
    ./src/lib/foo.ts

https://nextjs.org/docs/messages/module-not-found

`)
  })

  it('formats multiple import traces with distinct layers', () => {
    const trace1: PlainTraceItem[] = [
      traceItem('src/app/page.ts', 'client'),
      traceItem('src/lib/foo.ts', 'client'),
    ]
    const trace2: PlainTraceItem[] = [
      traceItem('src/app/page.ts', 'server'),
      traceItem('src/lib/foo.ts', 'server'),
    ]
    const issue: Issue = {
      ...baseIssue,
      importTraces: [trace1, trace2],
    }
    const output = formatIssue(issue)
    expect(output).toBe(`\
./src/app/page.ts
Module not found
Import traces:
  client:
    ./src/app/page.ts
    ./src/lib/foo.ts

  server:
    ./src/app/page.ts
    ./src/lib/foo.ts

https://nextjs.org/docs/messages/module-not-found

`)
  })

  it('formats multiple import traces with identical layers', () => {
    const trace1: PlainTraceItem[] = [
      traceItem('src/app/page.ts', 'client'),
      traceItem('src/lib/foo.ts', 'client'),
    ]
    const trace2: PlainTraceItem[] = [
      traceItem('src/app/other.ts', 'client'),
      traceItem('src/lib/bar.ts', 'client'),
    ]
    const issue: Issue = {
      ...baseIssue,
      importTraces: [trace1, trace2],
    }
    const output = formatIssue(issue)
    expect(output).toBe(`\
./src/app/page.ts
Module not found
Import traces:
  #1 [client]:
    ./src/app/page.ts
    ./src/lib/foo.ts

  #2 [client]:
    ./src/app/other.ts
    ./src/lib/bar.ts

https://nextjs.org/docs/messages/module-not-found

`)
  })

  it('handles missing layers in traces', () => {
    const trace: PlainTraceItem[] = [
      traceItem('src/app/page.ts'),
      traceItem('src/lib/foo.ts'),
    ]
    const issue: Issue = {
      ...baseIssue,
      importTraces: [trace],
    }
    const output = formatIssue(issue)
    expect(output).toBe(`\
./src/app/page.ts
Module not found
Import trace:
  ./src/app/page.ts
  ./src/lib/foo.ts

https://nextjs.org/docs/messages/module-not-found

`)
  })
})
