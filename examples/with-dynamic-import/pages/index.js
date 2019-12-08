import React from 'react'
import { useRouter } from 'next/router'
import Header from '../components/Header'
import Counter from '../components/Counter'
import dynamic from 'next/dynamic'

const DynamicComponent1 = dynamic(import('../components/hello1'))

const DynamicComponent2WithCustomLoading = dynamic({
  loader: () => import('../components/hello2'),
  loading: () => <p>Loading caused by client page transition ...</p>,
})

const DynamicComponent3WithNoSSR = dynamic({
  loader: () => import('../components/hello3'),
  loading: () => <p>Loading ...</p>,
  ssr: false,
})

const DynamicComponent4 = dynamic({
  loader: () => import('../components/hello4'),
})

const DynamicComponent5 = dynamic({
  loader: () => import('../components/hello5'),
})

const DynamicBundle = dynamic({
  modules: () => ({
    Hello6: import('../components/hello6'),
    Hello7: import('../components/hello7'),
  }),
  render: (props, { Hello6, Hello7 }) => (
    <div style={{ padding: 10, border: '1px solid #888' }}>
      <Hello6 />
      <Hello7 />
    </div>
  ),
})

const IndexPage = ({ showMore }) => {
  const router = useRouter()
  const handleToggle = () => {
    if (showMore) {
      router.push('/')
      return
    }

    router.push('/?showMore=1')
  }

  return (
    <div>
      <Header />

      {/* Load immediately, but in a separate bundle */}
      <DynamicComponent1 />

      {/* Show a progress indicator while loading */}
      <DynamicComponent2WithCustomLoading />

      {/* This component will never be loaded */}
      {React.noSuchField && <DynamicComponent4 />}

      {/* Load on demand */}
      {showMore && <DynamicComponent5 />}
      <button onClick={handleToggle}>Toggle Show More</button>

      {/* Load multiple components in one bundle */}
      <DynamicBundle foo={1} />

      <p>HOME PAGE is here!</p>
      <Counter />

      {/* Load only on the client side */}
      <DynamicComponent3WithNoSSR />
    </div>
  )
}

IndexPage.getInitialProps = ({ query }) => {
  return { showMore: Boolean(query.showMore) }
}

export default IndexPage
