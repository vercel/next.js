import foo from './src/foo.js'
import fileTsx from './src/file-tsx.js'
import fileMts from './src/file-mts.mjs'
import fileCts from './src/file-cts.cjs'
import fileMjs from './src/file-mjs.mjs'
import fileCjs from './src/file-cjs.cjs'

it('should correctly resolve explicit extensions with nodenext', () => {
  expect(foo).toBe('foo.ts')
  expect(fileTsx).toBe('file-tsx')
  expect(fileMts).toBe('file-mts')
  expect(fileCts).toBe('file-cts')
  expect(fileMjs).toBe('file-mjs')
  expect(fileCjs).toBe('file-cjs')
})

// import fooButton from "foo/button";

// it("should correctly resolve explicit extensions with nodenext", () => {
//   expect(fooButton).toBe("button");
// });
