import {
  type ActionInfo,
  extractInfoFromActionId,
  filterActionArgs,
} from './server-action-info'

describe('extractInfoFromActionId', () => {
  test('should parse actionId with typeBit 0, no args used, no restArgs', () => {
    const actionId = '00' // 0b00000000

    const expected: ActionInfo = {
      type: 'server-action',
      usedArgs: [false, false, false, false, false, false],
      hasRestArgs: false,
    }

    expect(extractInfoFromActionId(actionId)).toEqual(expected)
  })

  test('should parse actionId with typeBit 1, all args used, restArgs true', () => {
    const actionId = 'ff' // 0b11111111

    const expected: ActionInfo = {
      type: 'use-cache',
      usedArgs: [true, true, true, true, true, true],
      hasRestArgs: true,
    }

    expect(extractInfoFromActionId(actionId)).toEqual(expected)
  })

  test('should parse actionId with typeBit 0, argMask 0b101010, restArgs false', () => {
    const actionId = '54' // 0b01010100

    const expected: ActionInfo = {
      type: 'server-action',
      usedArgs: [true, false, true, false, true, false],
      hasRestArgs: false,
    }

    expect(extractInfoFromActionId(actionId)).toEqual(expected)
  })

  test('should parse actionId with typeBit 1, argMask 0b000101, restArgs true', () => {
    const actionId = '8b' // 0b10001011

    const expected: ActionInfo = {
      type: 'use-cache',
      usedArgs: [false, false, false, true, false, true],
      hasRestArgs: true,
    }

    expect(extractInfoFromActionId(actionId)).toEqual(expected)
  })
})

describe('filterActionArgs', () => {
  test('should return empty array when no args are used and no restArgs', () => {
    const args = ['arg1', 'arg2', 'arg3']

    const actionInfo: ActionInfo = {
      type: 'server-action',
      usedArgs: [false, false, false, false, false, false],
      hasRestArgs: false,
    }

    expect(filterActionArgs(args, actionInfo)).toEqual([])
  })

  test('should return all args when all args are used and has restArgs', () => {
    const args = [
      'arg1',
      'arg2',
      'arg3',
      'arg4',
      'arg5',
      'arg6',
      'restArg1',
      'restArg2',
    ]

    const actionInfo: ActionInfo = {
      type: 'use-cache',
      usedArgs: [true, true, true, true, true, true],
      hasRestArgs: true,
    }

    expect(filterActionArgs(args, actionInfo)).toEqual(args)
  })

  test('should filter args when some args are used and no restArgs', () => {
    const args = ['arg1', 'arg2', 'arg3', 'arg4', 'arg5', 'arg6']

    const actionInfo: ActionInfo = {
      type: 'server-action',
      usedArgs: [true, false, true, false, true, false],
      hasRestArgs: false,
    }

    expect(filterActionArgs(args, actionInfo)).toEqual([
      'arg1',
      undefined,
      'arg3',
      undefined,
      'arg5',
      undefined,
    ])
  })

  test('should include restArgs when hasRestArgs is true', () => {
    const args = [
      'arg1',
      'arg2',
      'arg3',
      'arg4',
      'arg5',
      'arg6',
      'restArg1',
      'restArg2',
    ]

    const actionInfo: ActionInfo = {
      type: 'use-cache',
      usedArgs: [false, false, false, true, false, true],
      hasRestArgs: true,
    }

    expect(filterActionArgs(args, actionInfo)).toEqual([
      undefined,
      undefined,
      undefined,
      'arg4',
      undefined,
      'arg6',
      'restArg1',
      'restArg2',
    ])
  })

  test('should not include extra args when hasRestArgs is false', () => {
    const args = [
      'arg1',
      'arg2',
      'arg3',
      'arg4',
      'arg5',
      'arg6',
      'extraArg1',
      'extraArg2',
    ]

    const actionInfo: ActionInfo = {
      type: 'server-action',
      usedArgs: [true, true, true, true, true, true],
      hasRestArgs: false,
    }

    expect(filterActionArgs(args, actionInfo)).toEqual([
      'arg1',
      'arg2',
      'arg3',
      'arg4',
      'arg5',
      'arg6',
      undefined,
      undefined,
    ])
  })

  test('should handle args array shorter than 6 elements', () => {
    const args = ['arg1', 'arg2', 'arg3']

    const actionInfo: ActionInfo = {
      type: 'server-action',
      usedArgs: [true, false, true, false, false, false],
      hasRestArgs: false,
    }

    expect(filterActionArgs(args, actionInfo)).toEqual([
      'arg1',
      undefined,
      'arg3',
    ])
  })

  test('should handle empty args array', () => {
    const args: unknown[] = []

    const actionInfo: ActionInfo = {
      type: 'server-action',
      usedArgs: [false, false, false, false, false, false],
      hasRestArgs: false,
    }

    expect(filterActionArgs(args, actionInfo)).toEqual(args)
  })
})
