import fs from 'fs'

fs.readFileSync('does-not-exist.txt')

export default function handler() {
  return null
}
