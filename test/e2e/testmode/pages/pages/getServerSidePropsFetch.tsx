export default function Page({ text }) {
  return <pre>{text}</pre>
}

export async function getServerSideProps() {
  const text = await (await fetch('https://example.com')).text()
  return {
    props: { text },
  }
}
