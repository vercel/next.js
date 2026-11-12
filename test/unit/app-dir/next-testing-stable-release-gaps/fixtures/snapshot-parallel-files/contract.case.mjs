import { test, expect } from 'vitest'
test('first file snapshot', () => expect({ first: 42 }).toMatchSnapshot())
