import { connection } from 'next/server'

async function Inner({ id }) {
  'use cache'

  return <p>inner cache</p>
}

async function Outer({ id }) {
  'use cache'

  return <Inner id="inner" />
}

export default async function Page() {
  await connection()

  return <Outer id="outer" />
}
