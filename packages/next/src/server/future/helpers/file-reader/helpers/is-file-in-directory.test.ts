import { isFileInDirectory } from './is-file-in-directory'

describe('isFileInDirectory', () => {
  test('should return true if the file is within the directory', () => {
    const file = '/path/to/directory/file.txt'
    const dir = '/path/to/directory'
    const recursive = false

    const result = isFileInDirectory(file, dir, recursive)

    expect(result).toBe(true)
  })

  test('should return false if the file is not within the directory', () => {
    const file = '/path/to/other-directory/file.txt'
    const dir = '/path/to/directory'
    const recursive = false

    const result = isFileInDirectory(file, dir, recursive)

    expect(result).toBe(false)
  })

  test('should return true if the file is in a subdirectory when recursive is true', () => {
    const file = '/path/to/directory/subdirectory/file.txt'
    const dir = '/path/to/directory'
    const recursive = true

    const result = isFileInDirectory(file, dir, recursive)

    expect(result).toBe(true)
  })

  test('should return true if the file is in the same directory when recursive is false', () => {
    const file = '/path/to/directory/file.txt'
    const dir = '/path/to/directory'
    const recursive = false

    const result = isFileInDirectory(file, dir, recursive)

    expect(result).toBe(true)
  })

  test('should return false if the file is in a subdirectory when recursive is false', () => {
    const file = '/path/to/directory/subdirectory/file.txt'
    const dir = '/path/to/directory'
    const recursive = false

    const result = isFileInDirectory(file, dir, recursive)

    expect(result).toBe(false)
  })
})
