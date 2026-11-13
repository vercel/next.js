'use server'

import { lang } from 'next/root-params'

export async function readRootLanguage() {
  return lang()
}
