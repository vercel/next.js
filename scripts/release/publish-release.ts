import { exec } from './utils'

export default async function publishRelease() {
  await exec('pnpm tsx ./publish-npm.ts')
  await exec('pnpm tsx ./publish-release-note.ts')
}

publishRelease()
