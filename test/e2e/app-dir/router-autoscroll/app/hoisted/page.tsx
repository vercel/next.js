export default function Page() {
  return (
    <>
      <style precedence="alpha" href="custom-stylesheet"></style>
      {
        // Repeat 500 elements
        Array.from({ length: 500 }, (_, i) => (
          <div key={i}>{i}</div>
        ))
      }
    </>
  )
}
