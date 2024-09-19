
import {flag }from '@vercel/flags/next'

export const myFlag = flag({
    key:'custom-key',
    decide:()=>false,
})