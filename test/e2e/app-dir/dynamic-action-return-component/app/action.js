'use server'

import { createComponent } from "create-component"

export async function unused() {
  return 'unused'
}

export async function getFoo() {
  return 'foo'
}

export const NewServerComponent = createComponent({
  action: getFoo
})