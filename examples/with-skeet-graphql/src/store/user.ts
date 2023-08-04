import { atom } from 'recoil'

export type UserState = {
  id: string // GraphQL ID
  uid: string // Firebase UID
  email: string
  username: string
  iconUrl: string
  emailVerified: boolean
}

export const defaultUser = {
  id: '',
  uid: '',
  email: '',
  username: '',
  iconUrl: '',
  emailVerified: false,
}

export const userState = atom<UserState>({
  key: 'userState',
  default: defaultUser,
})
