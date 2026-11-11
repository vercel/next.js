import { appendFile } from 'node:fs/promises'
export async function setup() {
  await appendFile('lifecycle.txt', 'setup-b\n')
}
export async function teardown() {
  await appendFile('lifecycle.txt', 'teardown-b\n')
}
