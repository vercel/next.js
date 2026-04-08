'use server'

export type { Item } from './types'
export type { Foo }

type Foo = string

export async function actionA(): Promise<string> {
  return 'hello from actionA'
}
