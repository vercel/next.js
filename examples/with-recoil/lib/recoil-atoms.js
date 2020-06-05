import { atom, selector } from 'recoil'

export const countState = atom({
  key: 'count',
  default: 0,
})

export const incrementCount = selector({
  key: 'incrementCount',
  set: ({ set, get }) => {
    const currCount = get(countState)
    set(countState, currCount + 1)
  },
})

export const decrementCount = selector({
  key: 'decrementCount',
  set: ({ set, get }) => {
    const currCount = get(countState)
    set(countState, currCount - 1)
  },
})
