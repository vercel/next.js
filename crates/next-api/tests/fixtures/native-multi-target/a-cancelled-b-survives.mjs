import { test, expect, vi } from 'vitest'

vi.mock('next-test-native-cuts-a', () => {
  globalThis.__nativeCutsAStatic1 = (globalThis.__nativeCutsAStatic1 ?? 0) + 1
  return {
    value: 15,
    phase: 'a-static-15',
    fn(value) {
      return ['a-static-15', value]
    },
  }
})
vi.mock('next-test-native-cuts-b', function () {
  globalThis.__nativeCutsBStatic1 = (globalThis.__nativeCutsBStatic1 ?? 0) + 1
  return {
    value: 25,
    phase: 'b-static-25',
    fn(value) {
      return ['b-static-25', value]
    },
  }
})
vi.mock('next-test-native-cuts-a', () => {
  globalThis.__nativeCutsAStatic2 = (globalThis.__nativeCutsAStatic2 ?? 0) + 1
  return {
    value: 19,
    phase: 'a-static-19',
    fn(value) {
      return ['a-static-19', value]
    },
  }
})
vi.unmock('next-test-native-cuts-a')
vi.unmock('next-test-native-cuts-b')
vi.mock('next-test-native-cuts-b', function () {
  globalThis.__nativeCutsBStatic2 = (globalThis.__nativeCutsBStatic2 ?? 0) + 1
  return {
    value: 29,
    phase: 'b-static-29',
    fn(value) {
      return ['b-static-29', value]
    },
  }
})

import * as staticA from 'next-test-native-cuts-a'
import * as staticB from 'next-test-native-cuts-b'

test('retains two independent native targets through ordered cuts runtime actual reset and cache', async () => {
  let callsA = 0,
    callsB = 0,
    originalA,
    originalB
  const beforeA = await import('next-test-native-cuts-a'),
    beforeB = await import('next-test-native-cuts-b')
  vi.doMock('next-test-native-cuts-a', async (importOriginal) => {
    callsA++
    originalA = await importOriginal()
    return {
      value: 73,
      phase: 'a-runtime',
      fn(value) {
        return ['a-runtime', value]
      },
    }
  })
  vi.doMock('next-test-native-cuts-b', async function (importOriginal) {
    callsB++
    originalB = await importOriginal()
    return {
      value: 83,
      phase: 'b-runtime',
      fn(value) {
        return ['b-runtime', value]
      },
    }
  })
  const runtimeA = await import('next-test-native-cuts-a'),
    runtimeB = await import('next-test-native-cuts-b')
  const cachedA = await import('next-test-native-cuts-a'),
    cachedB = await import('next-test-native-cuts-b')
  const actualA = await vi.importActual('next-test-native-cuts-a'),
    actualB = await vi.importActual('next-test-native-cuts-b')
  vi.resetModules()
  const afterResetA = await import('next-test-native-cuts-a'),
    afterResetB = await import('next-test-native-cuts-b')
  const actualAfterA = await vi.importActual('next-test-native-cuts-a'),
    actualAfterB = await vi.importActual('next-test-native-cuts-b')
  vi.doUnmock('next-test-native-cuts-a')
  const unmockedA = await import('next-test-native-cuts-a'),
    stillMockedB = await import('next-test-native-cuts-b')
  vi.doUnmock('next-test-native-cuts-b')
  const unmockedB = await import('next-test-native-cuts-b')
  vi.resetModules()
  const finalA = await import('next-test-native-cuts-a'),
    finalB = await import('next-test-native-cuts-b')
  const a = [
    staticA,
    beforeA,
    runtimeA,
    cachedA,
    actualA,
    afterResetA,
    actualAfterA,
    unmockedA,
    finalA,
  ]
  const b = [
    staticB,
    beforeB,
    runtimeB,
    cachedB,
    actualB,
    afterResetB,
    actualAfterB,
    stillMockedB,
    unmockedB,
    finalB,
  ]
  expect(staticA.value).toBe(30)
  expect(staticB.value).toBe(29)
  expect(runtimeA.value).toBe(73)
  expect(runtimeB.value).toBe(83)
  expect(actualA.value).toBe(30)
  expect(actualB.value).toBe(40)
  expect(afterResetA.value).toBe(73)
  expect(afterResetB.value).toBe(83)
  expect(actualAfterA.value).toBe(30)
  expect(actualAfterB.value).toBe(40)
  expect(unmockedA.value).toBe(30)
  expect(stillMockedB.value).toBe(83)
  expect(unmockedB.value).toBe(40)
  expect(finalA.value).toBe(30)
  expect(finalB.value).toBe(40)
  expect(actualA.default.dependency.root).toBe(actualA.default)
  expect(actualB.default.dependency.root).toBe(actualB.default)
  expect(actualA.default).not.toBe(actualB.default)
  expect(callsA).toBe(1)
  expect(callsB).toBe(1)

  expect(beforeA).toBe(staticA)
  expect(beforeB).toBe(staticB)
  expect(cachedA).toBe(runtimeA)
  expect(cachedB).toBe(runtimeB)
  expect(afterResetA).toBe(runtimeA)
  expect(afterResetB).toBe(runtimeB)
  expect(stillMockedB).toBe(runtimeB)
  expect(originalA).toBe(actualA)
  expect(originalB).toBe(actualB)
  expect(actualAfterA).not.toBe(actualA)
  expect(actualAfterB).not.toBe(actualB)
  expect(unmockedA).toBe(actualAfterA)
  expect(unmockedB).toBe(actualAfterB)
  expect(finalA).not.toBe(unmockedA)
  expect(finalB).not.toBe(unmockedB)
  expect(actualAfterA.default).toBe(actualA.default)
  expect(actualAfterB.default).toBe(actualB.default)
  expect(finalA.default).toBe(actualA.default)
  expect(finalB.default).toBe(actualB.default)
  expect(actualAfterA.fn).toBe(actualA.fn)
  expect(actualAfterB.fn).toBe(actualB.fn)
  expect(finalA.fn).toBe(actualA.fn)
  expect(finalB.fn).toBe(actualB.fn)
  expect(runtimeA.fn('probe')).toEqual(['a-runtime', 'probe'])
  expect(runtimeB.fn('probe')).toEqual(['b-runtime', 'probe'])
  expect(new Set([...a, ...b]).size).toBe(9)
  for (const namespace of [
    actualA,
    actualAfterA,
    unmockedA,
    finalA,
    actualB,
    actualAfterB,
    unmockedB,
    finalB,
  ]) {
    expect(namespace.fn).toBe(namespace.default.fn)
    expect(namespace.default.evaluation).toBe(1)
    expect(namespace.default.dependency.evaluation).toBe(1)
    expect(namespace.default.dependency.root).toBe(namespace.default)
    expect(namespace.default.dependency.root.fn).toBe(namespace.fn)
    expect(namespace.default.dependency.rootHadFunctionDuringCycle).toBe(false)
  }
  expect(globalThis.__nativeCutsARoot).toBe(1)
  expect(globalThis.__nativeCutsADependency).toBe(1)
  expect(globalThis.__nativeCutsBRoot).toBe(1)
  expect(globalThis.__nativeCutsBDependency).toBe(1)
  expect(globalThis.__nativeCutsAStatic1 ?? 0).toBe(0)
  expect(globalThis.__nativeCutsAStatic2 ?? 0).toBe(0)
  expect(globalThis.__nativeCutsBStatic1 ?? 0).toBe(0)
  expect(globalThis.__nativeCutsBStatic2 ?? 0).toBe(1)
  expect(staticA).toBe(actualA)
  expect(staticB).not.toBe(actualB)
  expect(actualA.fn('probe')).toEqual(['a-original-cycle', 'probe', 1, true])
  expect(actualB.fn('probe')).toEqual(['b-original-cycle', 'probe', 1, true])
  expect(staticB.fn('probe')).toEqual(['b-static-29', 'probe'])
})
