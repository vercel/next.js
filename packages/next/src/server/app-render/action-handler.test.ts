import type { ServerModuleMap } from './manifests-singleton'
import { getValidatedMPAActionId, parseHostHeader } from './action-handler'

const ACTION_ID_A = 'a'.repeat(42)
const ACTION_ID_B = 'b'.repeat(42)
const UNKNOWN_ACTION_ID = 'c'.repeat(42)

const serverModuleMap: ServerModuleMap = {
  [ACTION_ID_A]: {
    id: 'module-a',
    name: ACTION_ID_A,
    chunks: [],
  },
  [ACTION_ID_B]: {
    id: 'module-b',
    name: ACTION_ID_B,
    chunks: [],
  },
}

function createBoundActionDescriptor(actionId: string): string {
  return JSON.stringify({ id: actionId, bound: null })
}

describe('getValidatedMPAActionId', () => {
  it('returns null when the form does not contain an action', () => {
    const formData = new FormData()
    formData.append('name', 'value')

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBeNull()
  })

  it('returns a valid unbound action ID', () => {
    const formData = new FormData()
    formData.append(`$ACTION_ID_${ACTION_ID_A}`, '')

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBe(ACTION_ID_A)
  })

  it('returns a valid bound action ID', () => {
    const formData = new FormData()
    formData.append('$ACTION_REF_0', '')
    formData.append('$ACTION_0:0', createBoundActionDescriptor(ACTION_ID_A))

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBe(ACTION_ID_A)
  })

  it('returns the last valid action ID to match React decodeAction', () => {
    const formData = new FormData()
    formData.append(`$ACTION_ID_${ACTION_ID_A}`, '')
    formData.append(`$ACTION_ID_${ACTION_ID_B}`, '')

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBe(ACTION_ID_B)
  })

  it.each([
    ['an unbound action followed by a bound action', 'unbound-bound'],
    ['a bound action followed by an unbound action', 'bound-unbound'],
  ])('returns the last action for %s', (_description, order) => {
    const formData = new FormData()
    if (order === 'unbound-bound') {
      formData.append(`$ACTION_ID_${ACTION_ID_A}`, '')
      formData.append('$ACTION_REF_0', '')
      formData.append('$ACTION_0:0', createBoundActionDescriptor(ACTION_ID_B))
    } else {
      formData.append('$ACTION_REF_0', '')
      formData.append('$ACTION_0:0', createBoundActionDescriptor(ACTION_ID_A))
      formData.append(`$ACTION_ID_${ACTION_ID_B}`, '')
    }

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBe(ACTION_ID_B)
  })

  it('returns the last of multiple bound actions', () => {
    const formData = new FormData()
    formData.append('$ACTION_REF_0', '')
    formData.append('$ACTION_0:0', createBoundActionDescriptor(ACTION_ID_A))
    formData.append('$ACTION_REF_1', '')
    formData.append('$ACTION_1:0', createBoundActionDescriptor(ACTION_ID_B))

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBe(ACTION_ID_B)
  })

  it('ignores duplicate action markers to match React decodeAction', () => {
    const formData = new FormData()
    formData.append('$ACTION_REF_0', '')
    formData.append('$ACTION_0:0', createBoundActionDescriptor(ACTION_ID_A))
    formData.append(`$ACTION_ID_${ACTION_ID_B}`, '')
    formData.append('$ACTION_REF_0', '')

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBe(ACTION_ID_B)
  })

  it('ignores duplicate unbound action markers', () => {
    const formData = new FormData()
    formData.append(`$ACTION_ID_${ACTION_ID_A}`, '')
    formData.append(`$ACTION_ID_${ACTION_ID_B}`, '')
    formData.append(`$ACTION_ID_${ACTION_ID_A}`, '')

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBe(ACTION_ID_B)
  })

  it.each([
    ['a too-short action ID', `$ACTION_ID_${ACTION_ID_A.slice(1)}`],
    ['a too-long action ID', `$ACTION_ID_${ACTION_ID_A}extra`],
    ['an unknown action ID', `$ACTION_ID_${UNKNOWN_ACTION_ID}`],
  ])('rejects %s', (_description, actionField) => {
    const formData = new FormData()
    formData.append(actionField, '')

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBeNull()
  })

  it.each([
    ['a missing descriptor', undefined],
    ['a non-string descriptor', new Blob()],
    ['a malformed descriptor', '{}'],
    [
      'a descriptor with a too-short action ID',
      createBoundActionDescriptor(ACTION_ID_A.slice(1)),
    ],
    [
      'a descriptor with a too-long action ID',
      createBoundActionDescriptor(`${ACTION_ID_A}extra`),
    ],
    [
      'a descriptor without a quote after the action ID',
      `{"id":"${ACTION_ID_A}x}`,
    ],
    [
      'a descriptor with an unknown action ID',
      createBoundActionDescriptor(UNKNOWN_ACTION_ID),
    ],
  ])('rejects %s for a bound action', (_description, descriptor) => {
    const formData = new FormData()
    formData.append('$ACTION_REF_0', '')
    if (descriptor !== undefined) {
      formData.append('$ACTION_0:0', descriptor)
    }

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBeNull()
  })

  it('accepts a bound descriptor that appears before its action marker', () => {
    const formData = new FormData()
    formData.append('$ACTION_0:0', createBoundActionDescriptor(ACTION_ID_A))
    formData.append('$ACTION_REF_0', '')

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBe(ACTION_ID_A)
  })

  it('ignores unreferenced descriptors and unrelated action fields', () => {
    const formData = new FormData()
    formData.append(
      '$ACTION_unused:0',
      createBoundActionDescriptor(ACTION_ID_B)
    )
    formData.append('$ACTION_unrelated', '')
    formData.append(`$ACTION_ID_${ACTION_ID_A}`, '')

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBe(ACTION_ID_A)
  })

  it('rejects duplicate bound action descriptors', () => {
    const formData = new FormData()
    formData.append('$ACTION_REF_0', '')
    formData.append('$ACTION_0:0', createBoundActionDescriptor(ACTION_ID_A))
    formData.append('$ACTION_0:0', createBoundActionDescriptor(ACTION_ID_A))

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBeNull()
  })

  it('rejects the full form if any action ID is invalid', () => {
    const formData = new FormData()
    formData.append(`$ACTION_ID_${UNKNOWN_ACTION_ID}`, '')
    formData.append(`$ACTION_ID_${ACTION_ID_A}`, '')

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBeNull()
  })

  it('rejects a valid action followed by an invalid action', () => {
    const formData = new FormData()
    formData.append(`$ACTION_ID_${ACTION_ID_A}`, '')
    formData.append(`$ACTION_ID_${UNKNOWN_ACTION_ID}`, '')

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBeNull()
  })

  it('does not rescan the form data for each bound action reference', () => {
    const formData = new FormData()
    for (let index = 0; index < 100; index++) {
      formData.append(`$ACTION_REF_${index}`, '')
      formData.append(
        `$ACTION_${index}:0`,
        createBoundActionDescriptor(ACTION_ID_A)
      )
    }
    const getAll = jest.spyOn(formData, 'getAll')

    expect(getValidatedMPAActionId(formData, serverModuleMap)).toBe(ACTION_ID_A)
    expect(getAll).not.toHaveBeenCalled()
  })
})

describe('parseHostHeader', () => {
  it('should return correct host', () => {
    expect(parseHostHeader({})).toBe(undefined)

    expect(
      parseHostHeader({
        host: 'www.foo.com',
      })
    ).toEqual({ type: 'host', value: 'www.foo.com' })

    expect(
      parseHostHeader({
        host: undefined,
        'x-forwarded-host': 'www.foo.com',
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.foo.com' })

    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': undefined,
      })
    ).toEqual({ type: 'host', value: 'www.foo.com' })
  })

  it('should return x-forwarded-host over host header', () => {
    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': 'www.bar.com',
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })
  })

  it('should return correct x-forwarded-host when provided in array', () => {
    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': ['www.bar.com', 'www.baz.com'],
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })

    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': [],
      })
    ).toEqual({ type: 'host', value: 'www.foo.com' })

    expect(
      parseHostHeader({
        host: 'www.foo.com',
        'x-forwarded-host': 'www.bar.com, www.baz.com',
      })
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })
  })

  it('should return whichever matches provided origin', () => {
    expect(
      parseHostHeader(
        {
          host: 'www.foo.com',
          'x-forwarded-host': ['www.bar.com', 'www.baz.com'],
        },
        'www.foo.com'
      )
    ).toEqual({ type: 'host', value: 'www.foo.com' })

    expect(
      parseHostHeader(
        {
          host: 'www.foo.com',
          'x-forwarded-host': ['www.bar.com'],
        },
        'www.bar.com'
      )
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })

    expect(
      parseHostHeader(
        {
          host: 'www.foo.com',
          'x-forwarded-host': 'www.bar.com, www.baz.com',
        },
        'www.bar.com'
      )
    ).toEqual({ type: 'x-forwarded-host', value: 'www.bar.com' })
  })
})
