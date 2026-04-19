'use server'
import { Hello } from './client-component'

export async function getComponent() {
  return {
    component: <Hello />,
  }
}
