import { appendFile } from 'node:fs/promises'
export default async (project) => {
  await appendFile('lifecycle.txt', 'setup-a\n')
  project.provide('setupValue', 42)
  return async () => appendFile('lifecycle.txt', 'teardown-a\n')
}
