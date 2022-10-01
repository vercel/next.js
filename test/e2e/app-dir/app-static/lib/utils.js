// TODO: replace use/cache with react imports when available
import { experimental_use } from 'react'

export const cache = (cb, ...args) => cb(...args)
export const use = experimental_use
