export default async function Page(props) {
  const { slug } = await props.params

  return <div data-page>This is the validation page: {slug}</div>
}
