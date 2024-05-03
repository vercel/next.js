import { Form } from './form'

export default async function Page() {
  const randomNum = Math.random()

  return (
    <div>
      <Form randomNum={randomNum} />
    </div>
  )
}
