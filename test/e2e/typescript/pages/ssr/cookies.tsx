import { GetServerSideProps } from 'next'

type Props = {
  data: string
  cookies: any
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  req,
}) => {
  return {
    props: { data: 'hello world', cookies: req.cookies },
  }
}

export default function Page({ cookies }: Props) {
  return <pre id="cookies">{JSON.stringify(cookies)}</pre>
}
