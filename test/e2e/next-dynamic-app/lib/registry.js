import dynamic from 'next/dynamic'

const components = {
  list: dynamic(() => import('../components/list')),
}

export function Render({ name }) {
  const Component = components[name]
  return <Component />
}
