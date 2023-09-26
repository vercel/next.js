import path from 'path'
import { isFileInDirectory } from './is-file-in-directory'

describe('isFileInDirectory', () => {
  describe.each([
    { name: 'win32', sep: path.win32.sep, normalize: path.win32.normalize },
    { name: 'posix', sep: path.posix.sep, normalize: path.posix.normalize },
  ])('on $name', ({ sep, normalize }) => {
    describe('recursive', () => {
      describe('positive', () => {
        test.each([
          ['/file.txt', '/'],
          ['/path/file.txt', '/'],
          ['/path/to/file.txt', '/'],
          ['/path/to/directory/file.txt', '/'],
          ['/path/to/directory/file.txt', '/path'],
          ['/path/to/directory/file.txt', '/path/to'],
          ['/path/to/directory/file.txt', '/path/to/directory'],
        ])(`%s is in %s`, (file, dir) => {
          expect(
            isFileInDirectory(normalize(file), normalize(dir), true, sep)
          ).toBe(true)
        })
      })

      describe('negative', () => {
        test.each([
          ['/file.txt', '/path'],
          ['/path/file.txt', '/path/to'],
          ['/path/to/file.txt', '/path/to/directory'],
          ['/path/to/directory/file.txt', '/path/to/directory/subdirectory'],
          ['/path/to/directory/file.txt', '/path/to/directory/subdirectory/'],
        ])(`%s is not in %s`, (file, dir) => {
          expect(
            isFileInDirectory(normalize(file), normalize(dir), true, sep)
          ).toBe(false)
        })
      })
    })

    describe('non-recursive', () => {
      describe('positive', () => {
        test.each([
          ['/file.txt', '/'],
          ['/path/file.txt', '/path'],
          ['/path/to/file.txt', '/path/to'],
          ['/path/to/directory/file.txt', '/path/to/directory'],
        ])('%s is in %s', (file, dir) => {
          expect(
            isFileInDirectory(normalize(file), normalize(dir), false, sep)
          ).toBe(true)
        })
      })

      describe('negative', () => {
        test.each([
          ['/file.txt', '/path'],
          ['/path/file.txt', '/path/to'],
          ['/path/to/file.txt', '/path'],
          ['/path/to/directory/file.txt', '/path/to'],
        ])('%s is not in %s', (file, dir) => {
          expect(
            isFileInDirectory(normalize(file), normalize(dir), false, sep)
          ).toBe(false)
        })
      })
    })
  })
})
