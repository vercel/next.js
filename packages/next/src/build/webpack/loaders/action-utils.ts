import { createHash } from 'crypto'

export function generateActionId(filePath: string, exportName: string) {
  return createHash('sha1')
    .update(filePath + ':' + exportName)
    .digest('hex')
}

export function decodeActionBoundArg(actionId: string, arg: any) {
  console.log('decoding', arg)
  return arg
}

export function encodeActionBoundArg(actionId: string, arg: any) {
  console.log('encoding', arg)
  return arg
}
