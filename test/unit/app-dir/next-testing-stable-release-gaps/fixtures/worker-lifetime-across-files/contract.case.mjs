import { owned } from './worker-helper.mjs'
import { expect } from 'vitest'
owned('first file worker lease', ({ value }) => expect(value).toBe(1))
