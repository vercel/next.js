export async function getStaticProps() {
  return {
    props: {
      now: Date.now().toString(),
    },
    revalidate: 3600,
  }
}

export default function Page({ now }) {
  return <p id="now">{now}</p>
}
