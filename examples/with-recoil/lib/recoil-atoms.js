import { atom, selector } from 'recoil'

export const latestTime = atom({
  key: 'latestTime',
  default: null,
})

export const timeState = selector({
  key: 'time',
  get: ({ get }) => {
    const lastUpdate = get(latestTime) || Date.now()
    return new Date(lastUpdate).toJSON().slice(11, 19)
  },
  set: ({ set }) => {
    set(latestTime, Date.now())
  },
})

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
