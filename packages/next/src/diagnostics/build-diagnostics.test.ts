import { mkdtemp, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { setGlobal } from '../trace/shared'
import {
  recordFrameworkVersion,
  updateBuildDiagnostics,
} from './build-diagnostics'

async function readBuildDiagnostics(dir: string) {
  return JSON.parse(
    await readFile(join(dir, 'diagnostics', 'build-diagnostics.json'), 'utf8')
  )
}

describe('build-diagnostics', () => {
  it('records framework version to framework.json correctly', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'build-diagnostics'))
    setGlobal('distDir', tmpDir)

    // Record the initial diagnostics and make sure it's correct.
    await recordFrameworkVersion('14.2.3')
    let diagnostics = JSON.parse(
      await readFile(join(tmpDir, 'diagnostics', 'framework.json'), 'utf8')
    )
    expect(diagnostics.version).toEqual('14.2.3')
  })

  it('records build diagnostics to a file correctly', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'build-diagnostics'))
    setGlobal('distDir', tmpDir)

    // Record the initial diagnostics and make sure it's correct.
    await updateBuildDiagnostics({
      buildStage: 'compile',
    })
    let diagnostics = await readBuildDiagnostics(tmpDir)
    expect(diagnostics.buildStage).toEqual('compile')

    // Add a new build option. Make sure that existing fields are preserved.
    await updateBuildDiagnostics({
      buildStage: 'compile-server',
      buildOptions: {
        useBuildWorker: String(false),
      },
    })
    diagnostics = await readBuildDiagnostics(tmpDir)
    expect(diagnostics.buildStage).toEqual('compile-server')
    expect(diagnostics.buildOptions).toEqual({
      useBuildWorker: 'false',
    })

    // Make sure that it keeps existing build options when adding a new one.
    await updateBuildDiagnostics({
      buildStage: 'compile-client',
      buildOptions: {
        experimentalBuildMode: 'compile',
      },
    })
    diagnostics = await readBuildDiagnostics(tmpDir)
    expect(diagnostics.buildStage).toEqual('compile-client')
    expect(diagnostics.buildOptions).toEqual({
      experimentalBuildMode: 'compile',
      useBuildWorker: 'false',
    })
  })
})
