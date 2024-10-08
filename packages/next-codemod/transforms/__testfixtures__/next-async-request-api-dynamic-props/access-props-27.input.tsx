interface Props {
  params: {
    slug: string;
  }
}

export default async function Page(props: Props) {
  const config = { ...props }
  return (
    <Child {...props} {...config} />
  )
}
