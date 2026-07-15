import { GetServerSideProps } from 'next'

type Props = {
  data: string
}

export const getServerSideProps: GetServerSideProps<Props> = async (
  context
) => {
  return {
    props: (async function () {
      return { data: 'some data' }
    })(),
  }
}

export default function Page({ data }: Props) {
  return <h1> {data} </h1>
}
