interface ExampleUnusedParamsProps {
  params: {
    id: string;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ExampleUnusedParams({params}: ExampleUnusedParamsProps) {
  return (
    <div>foo</div>
  )
}
