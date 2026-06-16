window.addEventListener('error', (event) => {
  const error = event.error
  console.log(
    `report error, digest: ${error.digest}, message: "${error.message}"`
  )
})
