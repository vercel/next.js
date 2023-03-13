import dynamic from 'next/dynamic'

const Hello = dynamic(() => import('../components/hello'), { ssr: true })

export default () => {
  // make sure we handle this syntax correctly
  const { hi } = process.env
  console.log(hi)
  return (
    <>
      <p>hi there 👋</p>
      <Hello />
    </>
  )
}
