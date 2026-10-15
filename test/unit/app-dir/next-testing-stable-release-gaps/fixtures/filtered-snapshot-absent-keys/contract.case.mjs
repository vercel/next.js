import { test, expect } from 'vitest'
test('selected', () => expect('new').toMatchSnapshot())
test('unselected', () => expect('other').toMatchSnapshot())
