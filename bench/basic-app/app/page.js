import React from 'react'
import fs from 'fs'
import path from 'path'
import { foo } from './x-bundled'

export default async function Page() {
  const data = await fs.promises.readFile(
    path.join(process.cwd(), 'data.txt'),
    'utf8'
  )

  return (
    <h1>
      My Page: {data} {foo}
    </h1>
  )
}

export const dynamic = 'force-dynamic'
