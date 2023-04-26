'use server'

import { headers, cookies } from 'next/headers'

export async function getCookie(name) {
  return cookies().get(name)
}

export async function getHeader(name) {
  return headers().get(name)
}
