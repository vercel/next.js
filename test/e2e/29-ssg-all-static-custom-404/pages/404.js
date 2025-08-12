export default function Page({ found }) {
  return <p>page not {found}</p>
}

export const getStaticProps = () => {
  return {
    props: {
      found: 'found',
    },
  }
}
