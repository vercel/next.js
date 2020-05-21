import React from 'react'
import dynamic from 'next/dynamic'
import Router from 'next/router'
import PropTypes from 'prop-types'

const HelloBundle = dynamic({
  modules: (props) => {
    const components = {
      HelloContext: import('../../components/hello-context'),
      Hello1: import('../../components/hello1'),
      Hello2: import('../../components/hello2'),
    }

    return components
  },
  render: (props, { HelloContext, Hello1, Hello2 }) => (
    <div>
      <h1>{props.title}</h1>
      <HelloContext />
      <Hello1 />
      {props.showMore ? <Hello2 /> : null}
    </div>
  ),
})

export default class Bundle extends React.Component {
  static childContextTypes = {
    data: PropTypes.object,
  }

  static getInitialProps({ query }) {
    return { showMore: Boolean(query.showMore) }
  }

  getChildContext() {
    return {
      data: { title: 'Vercel Rocks' },
    }
  }

  toggleShowMore() {
    if (this.props.showMore) {
      Router.push('/dynamic/bundle')
      return
    }

    Router.push('/dynamic/bundle?showMore=1')
  }

  render() {
    const { showMore } = this.props

    return (
      <div>
        <HelloBundle showMore={showMore} title="Dynamic Bundle" />
        <button id="toggle-show-more" onClick={() => this.toggleShowMore()}>
          Toggle Show More
        </button>
      </div>
    )
  }
}
