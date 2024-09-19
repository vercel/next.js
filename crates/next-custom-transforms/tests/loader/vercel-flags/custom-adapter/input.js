
import {unstable_flag }from '@vercel/flags/next'

export const myFlag = unstable_flag(customAdapter({
    decide:()=>false,
}))