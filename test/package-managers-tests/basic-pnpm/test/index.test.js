/* eslint-env jest */
import { execSync } from 'child_process'
import fs from 'fs-extra'
import path from 'path'

jest.setTimeout(100 * 1000)

beforeAll(async () => {
  exec('npm i -g pnpm')
  await clean()
})

afterAll(async () => {
  await clean()
})

test('pnpm installs', async () => {
  exec('pnpm init -y')
  exec('pnpm add next react react-dom')
  await useLocalNextjs()
  // exec('pnpm install')
})

test('nextjs builds with pnpm', () => {
  exec('pnpx next build')
})

const exec = (cmd) => {
  return execSync(cmd, {
    env: process.env,
    shell: true,
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
  })
}

async function useLocalNextjs() {
  // installed nextjs
  const nextPath = path.dirname(require.resolve('next/package.json'))

  // repository root
  const root = path.dirname(
    require.resolve(path.resolve(process.cwd(), 'package.json'))
  )

  // local nextjs
  const currentNextPath = path.resolve(root, 'packages/next')

  // copy local nextjs to node_modules
  await fs.copy(
    path.resolve(currentNextPath, 'dist'),
    path.resolve(nextPath, 'dist')
  )

  console.log('copied local nextjs to node_modules')
}

async function clean() {
  // jest test cannot be found if a package.json exists in test directory
  await fs.remove(path.resolve(__dirname, '../package.json'))
  await fs.remove(path.resolve(__dirname, '../node_modules'))
  await fs.remove(path.resolve(__dirname, '../pnpm-lock.yaml'))
}
