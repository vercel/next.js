import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from 'next'

export function getServerSideProps({ resolvedUrl }: GetServerSidePropsContext) {
  return { props: { marker: 'SSR destination', resolvedUrl } }
}

export default function Page({
  marker,
  resolvedUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <p id="destination">{marker}</p>
      <p id="resolved-url">{resolvedUrl}</p>
    </>
  )
}
