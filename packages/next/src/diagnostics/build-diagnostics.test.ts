import { mkdtemp, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { setGlobal } from '../trace/shared'
import { updateBuildDiagnostics } from './build-diagnostics'

async function readBuildDiagnostics(dir: string) {
  return JSON.parse(
    await readFile(join(dir, 'diagnostics', 'build-diagnostics.json'), 'utf8')
  )
}

describe('build-diagnostics', () => {
  it('records build diagnostics to a file correctly', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'build-diagnostics'))
    setGlobal('distDir', tmpDir)

    // Record the initial diagnostics and make sure it's correct.
    await updateBuildDiagnostics({
      version: '14.2.3',
    })
    let diagnostics = await readBuildDiagnostics(tmpDir)
    expect(diagnostics.version).toEqual('14.2.3')

    // Add a new build option. Make sure that existing fields are preserved.
    await updateBuildDiagnostics({
      buildStage: 'compile',
      buildOptions: {
        useBuildWorker: String(false),
      },
    })
    diagnostics = await readBuildDiagnostics(tmpDir)
    expect(diagnostics.version).toEqual('14.2.3')
    expect(diagnostics.buildStage).toEqual('compile')
    expect(diagnostics.buildOptions).toEqual({
      useBuildWorker: 'false',
    })

    // Make sure that it keeps existing build options when adding a new one.
    await updateBuildDiagnostics({
      buildStage: 'compile',
      buildOptions: {
        experimentalBuildMode: 'compile',
      },
    })
    diagnostics = await readBuildDiagnostics(tmpDir)
    expect(diagnostics.version).toEqual('14.2.3')
    expect(diagnostics.buildStage).toEqual('compile')
    expect(diagnostics.buildOptions).toEqual({
      experimentalBuildMode: 'compile',
      useBuildWorker: 'false',
    })
  })
})
