type StaticPropsSecondaryPageProps = {
  message: string
}

export function getStaticProps() {
  return {
    props: {
      message: 'Pages getStaticProps Secondary',
    },
  }
}

export default function StaticPropsSecondaryPage({
  message,
}: StaticPropsSecondaryPageProps) {
  return <h1>{message}</h1>
}
