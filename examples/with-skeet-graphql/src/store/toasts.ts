import { atom } from 'recoil'

export type Toast = {
  title: string
  description: string
  type: 'success' | 'error' | 'warning' | 'info'
  createdAt: number
}

export type Toasts = Toast[]

export const toastsState = atom<Toasts>({
  key: 'toasts',
  default: [],
})
