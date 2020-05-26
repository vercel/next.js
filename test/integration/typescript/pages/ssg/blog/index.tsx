import { StaticProps } from 'next'

export const getStaticProps = async () => {
  return {
    props: { data: ['hello', 'world'] },
    unstable_revalidate: false,
  }
}

export default function Page({ data }: StaticProps<typeof getStaticProps>) {
  return <h1>{data.join(' ')}</h1>
}
