import { Form } from '../form'

function getRandomValue() {
  const v = Math.random()
  console.log(v)
  return v
}

export default function Page() {
  return (
    <Form
      foo={async function fooNamed() {
        'use cache'
        return getRandomValue()
      }}
      bar={async function () {
        'use cache'
        return getRandomValue()
      }}
      baz={async () => {
        'use cache'
        return getRandomValue()
      }}
    />
  )
}
