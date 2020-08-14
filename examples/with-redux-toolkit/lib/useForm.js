const useForm = (defaultValues = {}) => (handler) => async (event) => {
  event.preventDefault()
  event.persist()
  const form = event.target
  const data = Array.from(form.elements)
    .filter((element) => element.hasAttribute('name'))
    .reduce(
      (object, element) => ({
        ...object,
        [element.name]: element.value,
      }),
      defaultValues
    )
  await handler(data)
  form.reset()
}

export default useForm
