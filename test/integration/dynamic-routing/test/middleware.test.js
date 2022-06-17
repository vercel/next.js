/* eslint-env jest */
import './index.test'
import fs from 'fs-extra'
import { join } from 'path'

const middlewarePath = join(__dirname, '../middleware.js')

beforeAll(async () => {
  await fs.writeFile(
    middlewarePath,
    `
    import { NextResponse } from 'next/server'
    export default function middleware() {
      return NextResponse.next()
    }
  `
  )
})
afterAll(() => fs.remove(middlewarePath))
