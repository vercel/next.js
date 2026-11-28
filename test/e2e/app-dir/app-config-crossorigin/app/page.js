import dynamic from 'next/dynamic'

const DynamicWidget = dynamic(() => import('./dynamic-widget'))

export default function Index() {
  return (
    <>
      <p id="title">IndexPage</p>
      <DynamicWidget />
    </>
  )
}
