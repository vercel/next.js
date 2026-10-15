import { test, expect } from 'vitest'
test('second file snapshot', () => expect({ second: 42 }).toMatchSnapshot())
