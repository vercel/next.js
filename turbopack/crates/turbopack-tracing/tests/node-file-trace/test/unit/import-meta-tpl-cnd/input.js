import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

console.log(
  readFileSync(
    fileURLToPath(
      `${import.meta.url}/../${unknown ? 'asset1.txt' : 'asset2.txt'}`
    )
  ).toString()
)
