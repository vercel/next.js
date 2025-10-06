interface Props {
  params: {
    slug: string;
  }
}

export function generateMetadata(props: Props, parent: any) {
  console.log({ ...parent })
}

export default async function Page(props: Props) {
  const config = { ...props }
  return (
    <Child {...props} {...config} />
  )
}

export function GET(req, ctx) {
  console.log(
    { ...ctx }
  )
}

export function POST(req, ctx) {
  console.log(
    { ...req }
  )
}

export function PATCH(req, ctx) {
  console.log(
    { /* @next-codemod-ignore */ ...ctx }
  )
}

export function PUT(req, ctx) {
  console.log(
    {
      // @next-codemod-ignore
      ...ctx
    }
  )
}

export function OPTIONS(req, ctx) {
  console.log(
    {
      // @next-codemod-incorrect-ignore
      ...ctx
    }
  )
}
