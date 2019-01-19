import React from 'react'
import Router from 'next/router'
import Header from '../components/Header'
import Counter from '../components/Counter'
import dynamic from 'next/dynamic'

const DynamicComponent1 = dynamic(import('../components/hello1'))

const DynamicComponent2WithCustomLoading = dynamic({
  loader: () => import('../components/hello2'),
  loading: () => <p>Loading caused by client page transition ...</p>
})

const DynamicComponent3WithNoSSR = dynamic({
  loader: () => import('../components/hello3'),
  loading: () => <p>Loading ...</p>,
  ssr: false
})

const DynamicComponent4 = dynamic({
  loader: () => import('../components/hello4')
})

const DynamicComponent5 = dynamic({
  loader: () => import('../components/hello5')
})

const DynamicBundle = dynamic({
  modules: () => {
    const components = {
      Hello6: import('../components/hello6'),
      Hello7: import('../components/hello7')
    }
    return components
  },
  render: (props, { Hello6, Hello7 }) => (
    <div style={{ padding: 10, border: '1px solid #888' }}>
      <Hello6 />
      <Hello7 />
    </div>
  )
})

export default class Index extends React.Component {
  static getInitialProps ({ query }) {
    return { showMore: Boolean(query.showMore) }
  }

  toggleShowMore = () => {
    const { showMore } = this.props
    if (showMore) {
      Router.push('/')
      return
    }

    Router.push('/?showMore=1')
  }

  render () {
    const { showMore } = this.props

    return (
      <div>
        <Header />

        {/* Load immediately, but in a separate bundle */}
        <DynamicComponent1 />

        {/* Show a progress indicator while loading */}
        <DynamicComponent2WithCustomLoading />

        {/* Load only on the client side */}
        <DynamicComponent3WithNoSSR />

        {/* This component will never be loaded */}
        {React.noSuchField && <DynamicComponent4 />}

        {/* Load on demand */}
        {showMore && <DynamicComponent5 />}
        <button onClick={this.toggleShowMore}>Toggle Show More</button>

        {/* Load multiple components in one bundle */}
        <DynamicBundle />

        <p>HOME PAGE is here!</p>
        <Counter />
      </div>
    )
  }
}
