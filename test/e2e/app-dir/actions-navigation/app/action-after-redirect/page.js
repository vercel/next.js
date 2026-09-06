import { connection } from 'next/server'
import { Form } from './form'

export default async function Page() {
  await connection()
  const randomNum = Math.random()

  return (
    <div>
      <Form randomNum={randomNum} />
    </div>
  )
}
