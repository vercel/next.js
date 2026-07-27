'use server'

export type X = string
// @ts-ignore -- that file does not exist
export { type A } from './a'
// @ts-ignore -- that file does not exist
export type { B } from './b'
// @ts-ignore -- that file does not exist
export type * from './c'

export async function actionA(): Promise<string> {
  return 'hello from actionA'
}
