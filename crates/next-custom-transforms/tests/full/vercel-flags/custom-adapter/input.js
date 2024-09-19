
import {flag }from '@vercel/flags/next'

export const myFlag = flag(customAdapter({
    decide:()=>false,
}))