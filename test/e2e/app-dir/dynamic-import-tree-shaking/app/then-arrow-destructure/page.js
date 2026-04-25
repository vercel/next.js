export default async function Page() {
  const result = await new Promise((resolve) => {
    import('../../lib/then-arrow-module').then(({ thenArrowUsed }) => {
      resolve(thenArrowUsed())
    })
  })
  return <div>{result}</div>
}
