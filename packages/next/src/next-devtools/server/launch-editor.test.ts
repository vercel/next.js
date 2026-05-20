import child_process from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { escapeApplescriptStringFragment, launchEditor } from './launch-editor'

const VISUAL_STUDIO_CODE_CLI =
  '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
const VISUAL_STUDIO_CODE_INSIDERS_CLI =
  '/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code'

const macOSEditorDetectionCases = [
  [
    'current Visual Studio Code executable name',
    '/Applications/Visual Studio Code.app/Contents/MacOS/Code',
    VISUAL_STUDIO_CODE_CLI,
  ],
  [
    'legacy Visual Studio Code executable name',
    '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
    VISUAL_STUDIO_CODE_CLI,
  ],
  [
    'current Visual Studio Code Insiders executable name',
    '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Code - Insiders',
    VISUAL_STUDIO_CODE_INSIDERS_CLI,
  ],
] as const

describe('applescript string escaping', () => {
  it('should escape strings correctly', () => {
    const result = escapeApplescriptStringFragment(`abc\\def"ghi\\\\`)
    expect(result).toBe(`abc\\\\def\\"ghi\\\\\\\\`)
  })
})

describe('macOS editor detection', () => {
  const originalPlatform = process.platform
  let fileName: string
  let testDirectory: string

  beforeEach(() => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    })
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'next-editor-test-'))
    fileName = path.join(testDirectory, 'page.tsx')
    fs.writeFileSync(fileName, '')
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    })
    fs.rmSync(testDirectory, { force: true, recursive: true })
    jest.restoreAllMocks()
  })

  it.each(macOSEditorDetectionCases)(
    'detects the %s',
    (_, processName, cli) => {
      jest
        .spyOn(child_process, 'execSync')
        .mockReturnValue(Buffer.from(`123 ?? 0:00.00 ${processName}`))
      const spawn = jest.spyOn(child_process, 'spawn').mockReturnValue({
        on: jest.fn(),
      } as unknown as child_process.ChildProcess)

      launchEditor(fileName, 1, 1)

      expect(spawn).toHaveBeenCalledWith(cli, ['-g', `${fileName}:1:1`], {
        stdio: 'inherit',
      })
    }
  )
})
