import { expect, test } from 'vitest'
test('snapshot second', () => expect({ value: 'second' }).toMatchSnapshot())
