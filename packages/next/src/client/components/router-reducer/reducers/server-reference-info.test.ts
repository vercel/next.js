import {
  type ServerReferenceInfo,
  extractInfoFromServerReferenceId,
  omitUnusedArgs,
} from './server-reference-info'

describe('extractInfoFromServerReferenceId', () => {
  test('should parse id with typeBit 0, no args used, no restArgs', () => {
    const id = '00' // 0b00000000

    const expected: ServerReferenceInfo = {
      type: 'server-action',
      usedArgs: [false, false, false, false, false, false],
      hasRestArgs: false,
    }

    expect(extractInfoFromServerReferenceId(id)).toEqual(expected)
  })

  test('should parse id with typeBit 1, all args used, restArgs true', () => {
    const id = 'ff' // 0b11111111

    const expected: ServerReferenceInfo = {
      type: 'use-cache',
      usedArgs: [true, true, true, true, true, true],
      hasRestArgs: true,
    }

    expect(extractInfoFromServerReferenceId(id)).toEqual(expected)
  })

  test('should parse id with typeBit 0, argMask 0b101010, restArgs false', () => {
    const id = '54' // 0b01010100

    const expected: ServerReferenceInfo = {
      type: 'server-action',
      usedArgs: [true, false, true, false, true, false],
      hasRestArgs: false,
    }

    expect(extractInfoFromServerReferenceId(id)).toEqual(expected)
  })

  test('should parse id with typeBit 1, argMask 0b000101, restArgs true', () => {
    const id = '8b' // 0b10001011

    const expected: ServerReferenceInfo = {
      type: 'use-cache',
      usedArgs: [false, false, false, true, false, true],
      hasRestArgs: true,
    }

    expect(extractInfoFromServerReferenceId(id)).toEqual(expected)
  })
})

describe('omitUnusedArgs', () => {
  test('should return empty array when no args are used and no restArgs', () => {
    const args = ['arg1', 'arg2', 'arg3']

    const info: ServerReferenceInfo = {
      type: 'server-action',
      usedArgs: [false, false, false, false, false, false],
      hasRestArgs: false,
    }

    expect(omitUnusedArgs(args, info)).toEqual([])
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

    const info: ServerReferenceInfo = {
      type: 'use-cache',
      usedArgs: [true, true, true, true, true, true],
      hasRestArgs: true,
    }

    expect(omitUnusedArgs(args, info)).toEqual(args)
  })

  test('should filter args when some args are used and no restArgs', () => {
    const args = ['arg1', 'arg2', 'arg3', 'arg4', 'arg5', 'arg6']

    const info: ServerReferenceInfo = {
      type: 'server-action',
      usedArgs: [true, false, true, false, true, false],
      hasRestArgs: false,
    }

    expect(omitUnusedArgs(args, info)).toEqual([
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

    const info: ServerReferenceInfo = {
      type: 'use-cache',
      usedArgs: [false, false, false, true, false, true],
      hasRestArgs: true,
    }

    expect(omitUnusedArgs(args, info)).toEqual([
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

    const info: ServerReferenceInfo = {
      type: 'server-action',
      usedArgs: [true, true, true, true, true, true],
      hasRestArgs: false,
    }

    expect(omitUnusedArgs(args, info)).toEqual([
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

    const info: ServerReferenceInfo = {
      type: 'server-action',
      usedArgs: [true, false, true, false, false, false],
      hasRestArgs: false,
    }

    expect(omitUnusedArgs(args, info)).toEqual(['arg1', undefined, 'arg3'])
  })

  test('should handle empty args array', () => {
    const args: unknown[] = []

    const info: ServerReferenceInfo = {
      type: 'server-action',
      usedArgs: [false, false, false, false, false, false],
      hasRestArgs: false,
    }

    expect(omitUnusedArgs(args, info)).toEqual(args)
  })
})
