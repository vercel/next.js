import { unstable_flag as flag } from "@vercel/flags/next"

export const myFlag = flag({ decide: () => {} })