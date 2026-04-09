type StaticPropsPageProps = {
  message: string
}

export function getStaticProps() {
  return {
    props: {
      message: 'Pages getStaticProps Primary',
    },
  }
}

export default function StaticPropsPage({ message }: StaticPropsPageProps) {
  return <h1>{message}</h1>
}
