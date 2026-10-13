import { fetchOptions } from './fetch-options'

async function getData(key: string) {
  const url = process.env.TEST_DATA_SERVICE_URL
  if (!url) {
    throw new Error('TEST_DATA_SERVICE_URL is not set')
  }
  const res = await fetch(`${url}?key=${key}`, fetchOptions)
  const text = await res.text()
  if (!res.ok) {
    throw new Error(text)
  }
  return text
}

export default async function Page() {
  // Sequential, so the second fetch gets the options object after the first
  // fetch has used it.
  const first = await getData('first')
  const second = await getData('second')

  return (
    <>
      <p id="first">{first}</p>
      <p id="second">{second}</p>
      <p id="options">{JSON.stringify(fetchOptions)}</p>
    </>
  )
}
