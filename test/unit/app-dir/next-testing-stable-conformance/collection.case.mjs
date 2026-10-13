import { test } from 'vitest'
test('collected before failure', () => {})
throw new Error('collection failure')
