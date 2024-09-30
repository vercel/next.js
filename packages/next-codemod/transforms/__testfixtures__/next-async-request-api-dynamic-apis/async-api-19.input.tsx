import { cookies, headers } from 'next/headers'

export function myFun() {
  return async function () {
    cookies().get('name')
  }
}

export function myFun2() {
  return function () {
    headers()
  }
}
