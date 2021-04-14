import { ChangeEvent } from 'react'

const useForm = <TContent>(defaultValues: TContent) => (
  handler: (content: TContent) => void
) => async (event: ChangeEvent<HTMLFormElement>) => {
  event.preventDefault()
  event.persist()

  const form = event.target
  const elements = Array.from(form.elements) as HTMLInputElement[]
  const data = elements
    .filter((element) => element.hasAttribute('name'))
    .reduce(
      (object, element) => ({
        ...object,
        [`${element.getAttribute('name')}`]: element.value,
      }),
      defaultValues
    )
  await handler(data)
  form.reset()
}

export default useForm
