import ts from 'typescript/lib/tsserverlibrary'

import { NEXT_TS_ERRORS } from '../constant'
import { init } from '../utils'
import serverBoundary from './server-boundary'

function getDiagnostics(sourceText: string) {
  const fileName = 'C:/project/app/actions.ts'
  const compilerOptions = {
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    module: ts.ModuleKind.CommonJS,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  }
  const host = ts.createCompilerHost(compilerOptions)
  const readFile = host.readFile.bind(host)
  const fileExists = host.fileExists.bind(host)

  host.readFile = (file) => (file === fileName ? sourceText : readFile(file))
  host.fileExists = (file) => file === fileName || fileExists(file)

  const program = ts.createProgram([fileName], compilerOptions, host)
  const source = program.getSourceFile(fileName)
  if (!source) {
    throw new Error('Failed to create test source file')
  }

  init({
    ts,
    info: {
      languageService: {
        getProgram: () => program,
      },
      project: {
        getCurrentDirectory: () => 'C:/project',
        projectService: {
          logger: {
            info: jest.fn(),
          },
        },
      },
    } as any,
  })

  const diagnostics: ts.Diagnostic[] = []

  ts.forEachChild(source, (node) => {
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      diagnostics.push(
        ...serverBoundary.getSemanticDiagnosticsForExportVariableStatement(
          source,
          node
        )
      )
    } else if (
      ts.isFunctionDeclaration(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      diagnostics.push(
        ...serverBoundary.getSemanticDiagnosticsForFunctionExport(source, node)
      )
    }
  })

  return diagnostics
}

describe('server-boundary rule', () => {
  it('allows PromiseLike and promise intersection return types', () => {
    const diagnostics = getDiagnostics(`
      "use server"

      function something(): () => Promise<any> & { __errorType?: Error } {
        return {} as any
      }

      export const actionL = something()
      export const promiseLike = (): PromiseLike<number> => Promise.resolve(1)
      export function promise(): Promise<number> {
        return Promise.resolve(1)
      }
    `)

    expect(diagnostics).toEqual([])
  })

  it('reports exported functions that do not return promise-like values', () => {
    const diagnostics = getDiagnostics(`
      "use server"

      export const plain = (): number => 1
    `)

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].code).toBe(NEXT_TS_ERRORS.INVALID_SERVER_ENTRY_RETURN)
  })
})
