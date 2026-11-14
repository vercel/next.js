import {
  escapeApplescriptStringFragment,
  getArgumentsForLineNumber,
  guessEditor,
} from './launch-editor'
import child_process from 'child_process'

jest.mock('child_process', () => {
  const original = jest.requireActual('child_process')
  return {
    ...original,
    execSync: jest.fn(),
  }
})

describe('applescript string escaping', () => {
  it('should escape strings correctly', () => {
    const result = escapeApplescriptStringFragment(`abc\\def"ghi\\\\`)
    expect(result).toBe(`abc\\\\def\\"ghi\\\\\\\\`)
  })
})

describe('guessEditor', () => {
  const originalPlatform = process.platform

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    })
    jest.resetAllMocks()
  })

  it('should correctly guess VSCodium macOS binary renamed to VSCodium', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    })
    const execSyncMock = child_process.execSync as jest.Mock
    execSyncMock.mockReturnValue(
      ' 1234 ??         0:05.43 /Applications/VSCodium.app/Contents/MacOS/VSCodium\n'
    )

    const result = guessEditor()
    expect(result).toEqual([
      '/Applications/VSCodium.app/Contents/Resources/app/bin/codium',
    ])
  })
})

describe('getArgumentsForLineNumber', () => {
  it('should generate correct arguments for codium', () => {
    const result = getArgumentsForLineNumber(
      '/Applications/VSCodium.app/Contents/Resources/app/bin/codium',
      'file.txt',
      10,
      5
    )
    expect(result).toEqual(['-g', 'file.txt:10:5'])
  })
})
