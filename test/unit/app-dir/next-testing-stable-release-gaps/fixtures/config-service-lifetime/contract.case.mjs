import { test, expect, inject } from 'vitest'
test('config service stays alive through isolated execution', async () =>
  expect(await (await fetch(inject('url'))).text()).toBe('config service'))
