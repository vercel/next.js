export default function Page() {
  return <div />
}

export function getServerSideProps() {
  return {
    props: {
      type: 'SSR',
    },
  }
}

export const config = {
  runtime: 'edge',
}
