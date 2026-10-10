interface ExampleUnusedParamsProps {
  params: Promise<{
    id: string;
  }>
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function ExampleUnusedParams(props: ExampleUnusedParamsProps) {
  return (
    <div>foo</div>
  )
}
