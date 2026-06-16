window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason
  console.log(
    `report rejection, digest: ${error?.digest}, message: "${error?.message}"`
  )
})
