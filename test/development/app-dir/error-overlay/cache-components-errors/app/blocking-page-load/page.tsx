async function dynamicDataFetch() {
  // Intentionally using a timer instead of a built-in API like `connection`
  // because eventually we may discriminate the errors between the different
  // types of dynamic conditions.
  await new Promise((resolve) => setTimeout(resolve, 1000))
}

export default async function Page() {
  await dynamicDataFetch()
  return 'Blocking Page Load'
}
