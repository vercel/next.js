import type { GetServerSideProps } from 'next'

type Props = { locale: string }

export default function HomePage({ locale }: Props) {
  return (
    <div>
      <h1 id="pages-home">Pages Router Home</h1>
      <p id="pages-locale">{locale}</p>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps<Props> = async (
  context
) => {
  return { props: { locale: context.locale || 'en-US' } }
}
