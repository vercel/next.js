'use server'

import { headers, cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function setCookieWithMaxAge() {
  cookies().set({
    name: 'foo',
    value: 'bar',
    maxAge: 1000,
  })
}

export async function getCookie(name) {
  return cookies().get(name)
}

export async function getHeader(name) {
  return headers().get(name)
}

export async function setCookie(name, value) {
  cookies().set(name, value)
  return cookies().get(name)
}

export async function setCookieAndRedirect(name, value, path) {
  cookies().set(name, value)
  redirect(path)
}
