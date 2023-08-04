import { atom } from 'recoil'
import { recoilPersist } from 'recoil-persist'

const { persistAtom } = recoilPersist()
type PolicyAgreedState = boolean

export const policyAgreedState = atom<PolicyAgreedState>({
  key: 'policyAgreedState',
  default: false,
  effects_UNSTABLE: [persistAtom],
})
