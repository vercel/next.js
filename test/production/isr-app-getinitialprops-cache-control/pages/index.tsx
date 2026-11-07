import type { GetStaticProps } from 'next'

interface Props {
  message: string
}

export default function Page({ message }: Props) {
  return <p>{message}</p>
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  return {
    props: { message: 'hello world' },
    revalidate: 10,
  }
}
