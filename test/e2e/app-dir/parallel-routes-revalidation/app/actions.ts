'use server'
import { unstable_expirePath } from 'next/cache'
import { redirect } from 'next/navigation'

let data = []

export async function addData(newData: string) {
  // sleep 1s
  await new Promise((resolve) => setTimeout(resolve, 1000))
  data.push(newData)
}

export async function getData() {
  // sleep 1s
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return data
}

export async function redirectAction() {
  'use server'
  console.log('redirecting...')
  await new Promise((res) => setTimeout(res, 1000))
  redirect('/')
}

export async function clearData() {
  data = []
  unstable_expirePath('/')
}
