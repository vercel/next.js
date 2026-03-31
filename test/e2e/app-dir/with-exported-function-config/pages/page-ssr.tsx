export default function Page({ data }) {
  ;<p>hello {data}</p>
}

export const config = {
  maxDuration: 3,
}

export async function getServerSideProps() {
  return { props: { data: 'world' } }
}
