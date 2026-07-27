export async function getStaticProps() {
  const rand1 = Math.random()
  const rand2 = Math.random()

  // Pass data to the page via props
  return { props: { rand1, rand2 } }
}

export default function Page({ rand1, rand2 }) {
  return (
    <main>
      <ul>
        <li>{rand1}</li>
        <li>{rand2}</li>
      </ul>
    </main>
  )
}
