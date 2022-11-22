// this should be dynamic as it doesn't specify force-static
// and the parent layout uses `headers()`

export default function Page() {
  return (
    <>
      <p id="page">/force-static</p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
