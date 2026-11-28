import { track } from './analytics'

// Module caching terminates execution; chunk ancestry must also handle the cycle.
void import('./intermediate')
export const errorTracker = track
