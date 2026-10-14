import { expect, test } from 'vitest'
test('snapshot first', () => expect({ value: 'first' }).toMatchSnapshot())
