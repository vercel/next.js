import { nextDev } from '../cli/next-dev'

const [, , ...args] = process.argv
nextDev(args)
