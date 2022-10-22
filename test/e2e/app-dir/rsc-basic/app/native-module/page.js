import fs from 'fs'

import Foo from '../../components/foo'

export default function Page() {
  return (
    <>
      <h1>fs: {typeof fs.readFile}</h1>
      <Foo />
    </>
  )
}

export const runtime = 'nodejs'
