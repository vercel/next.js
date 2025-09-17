export default function Home() {
  return (
    <>
      <div className="red-text">This text should be red.</div>
      <StyledJsxTest />
    </>
  )
}

function StyledJsxTest() {
  return (
    <>
      <div className="media-query-test">This text should be blue.</div>
      <style jsx>{`
        .media-query-test {
          color: blue;
        }

        @media (max-width: 400px) {
          .media-query-test {
            color: orange;
          }
        }
      `}</style>
    </>
  )
}
