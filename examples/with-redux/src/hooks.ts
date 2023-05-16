/* Core */
import { useEffect, useRef } from 'react'

export const useForm =
  <TContent>(defaultValues: TContent) =>
  (handler: (content: TContent) => void) =>
  async (event: React.ChangeEvent<HTMLFormElement>) => {
    event.preventDefault()
    event.persist()

    const form = event.target as HTMLFormElement
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

// https://overreacted.io/making-setinterval-declarative-with-react-hooks/
export const useInterval = (callback: Function, delay: number) => {
  const savedCallback = useRef<Function>()
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])
  useEffect(() => {
    const handler = (...args: any) => savedCallback.current?.(...args)

    if (delay !== null) {
      const id = setInterval(handler, delay)
      return () => clearInterval(id)
    }
  }, [delay])
}
