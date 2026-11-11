import { createVitest } from 'vitest/node'
import { test } from 'vitest'
test('must not start another controller', () => createVitest('test'))
