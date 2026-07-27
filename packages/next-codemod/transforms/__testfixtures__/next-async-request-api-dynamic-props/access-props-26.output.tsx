interface Props {
  params: Promise<{
    slug: string;
  }>
  searchParams: Promise<{
    a: string;
  }>
}

export default async function Page(props: Props) {
  const [
    params,
    searchParams
  ] = await Promise.all([props.params, props.searchParams])
}

export async function generateMetadata(props: Props) {
  const [
    params,
  ] = await Promise.all([props.params, props.searchParams])
}
