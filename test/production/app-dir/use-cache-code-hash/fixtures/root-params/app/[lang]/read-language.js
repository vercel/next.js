import { lang } from 'next/root-params'

export async function readLanguage() {
  'use cache'
  return lang()
}
