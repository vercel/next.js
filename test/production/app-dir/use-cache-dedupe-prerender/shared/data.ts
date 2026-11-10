export async function data(key: string) {
  const response = await fetch(
    `${process.env.TEST_DATA_SERVICE_URL}?key=${key}`
  )
  return response.text()
}
