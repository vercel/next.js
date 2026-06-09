import type { GetServerSideProps } from 'next'

type Props = { locale: string }

export default function HomePage({ locale }: Props) {
  return (
    <div>
      <h1 id="pages-home">Pages Router Home</h1>
      <p id="pages-locale">{locale}</p>
      <p id="pages-message">
        {locale === 'nl-NL'
          ? 'Welkom op de homepagina'
          : 'Welcome to the homepage'}
      </p>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps<Props> = async (
  context
) => {
  return { props: { locale: context.locale || 'en-US' } }
}
