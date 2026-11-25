import fs from 'node:fs'
import { moduleCode } from '../../../__helpers__/module-factories.js'

it('treats node: builtins as externals', () => {
  expect(typeof fs.readFileSync).toBe('function')

  expect(moduleCode('index.js')).toContain('require("node:fs")')
})
