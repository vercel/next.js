import { test, expect, beforeEach, onTestFailed, afterAll } from 'vitest'
const observed = []
beforeEach(() => onTestFailed((context) => observed.push(context.task?.name)))
test.fails('failed owner', () => expect(1).toBe(2))
afterAll(() => expect(observed).toEqual(['failed owner']))
