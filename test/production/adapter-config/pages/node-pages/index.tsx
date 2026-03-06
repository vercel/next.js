export function getServerSideProps() {
  return {
    props: {
      now: Date.now(),
    },
  }
}

export function generateMarkdown(_context, { content }) {
  return content
}

export default function Page(props) {
  return (
    <>
      <p>/node-pages</p>
      <p>hello world</p>
      <p>now: {Date.now()}</p>
      <p>{JSON.stringify(props)}</p>
    </>
  )
}
