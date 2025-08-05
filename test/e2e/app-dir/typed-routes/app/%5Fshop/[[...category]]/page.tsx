export default async function Page(props: PageProps<'/_shop/[[...category]]'>) {
  const { category } = await props.params
  return <p>shop {category?.join('/')}</p>
}
