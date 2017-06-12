import React from 'react'
import dynamic from 'next/dynamic'
import Router from 'next/router'

const HelloBundle = dynamic({
  modules: (props) => {
    const components = {
      Hello1: import('../../components/hello1')
    }

    if (props.showMore) {
      components.Hello2 = import('../../components/hello2')
    }

    return components
  },
  render: (props, { Hello1, Hello2 }) => (
    <div>
      <h1>{props.title}</h1>
      <Hello1 />
      {Hello2? <Hello2 /> : null}
    </div>
  )
})

export default class Bundle extends React.Component {
  static getInitialProps ({ query }) {
    return { showMore: Boolean(query.showMore) }
  }

  toggleShowMore () {
    if (this.props.showMore) {
      Router.push('/dynamic/bundle')
      return
    }

    Router.push('/dynamic/bundle?showMore=1')
  }

  render () {
    const { showMore } = this.props

    return (
      <div>
        <HelloBundle showMore={showMore} title="Dynamic Bundle"/>
        <button
          id="toggle-show-more"
          onClick={() => this.toggleShowMore()}
        >
          Toggle Show More
        </button>
      </div>
    )
  }
}
