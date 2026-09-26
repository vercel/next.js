import { shared } from './shared'

export const second = shared
export const loadThird = () => import('./third')
