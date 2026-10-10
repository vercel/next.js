import { lang } from 'next/root-params'

export async function readDirect() {
  'use cache'
  return lang()
}
