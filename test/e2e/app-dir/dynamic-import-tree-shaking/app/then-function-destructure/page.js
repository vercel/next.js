export default async function Page() {
  const result = await new Promise((resolve) => {
    import('../../lib/then-function-module').then(function ({ thenFuncUsed }) {
      resolve(thenFuncUsed())
    })
  })
  return <div>{result}</div>
}
