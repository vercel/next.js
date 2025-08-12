export const dynamicParams = false

export const generateStaticParams = () => {
  return [
    {
      slug: 'first',
    },
  ]
}

export default function Page() {
  return (
    <>
      <p>nested-dynamic-params-false</p>
    </>
  )
}
