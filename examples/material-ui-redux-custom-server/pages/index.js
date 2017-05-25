import React from 'react'

import dynamic from 'next/dynamic'
import withRedux from 'next-redux-wrapper'

// redux
import { fetchData } from '@/reducer/newsListing'
import { initStore } from '@/store'

// custom component
import App from '@/components/App'
const CSSTag = dynamic(import('../components/CSSTag'))

// dynamic component
const BottomNav = dynamic(import('../components/BottomNav'))
const ListItem = dynamic(import('../components/ListItem'))

// style
import style from '@/styles/index.scss'

class Index extends React.Component {
  static getInitialProps (context) {
    const { store, isServer, query } = context

    if (!query.sortBy) {
      query.sortBy = 'latest'
    }

    return store.dispatch(fetchData(query)).then((newState) => {
      return { isServer, newState }
    })
  }

  constructor (props) {
    super(props)
    this.state = {
      selectedIndex: 0
    }
  }

  render () {
    const { newsListing: { articles } } = this.props
    return (
      <App>
        <div className='indexPage'>
          <div className='container'>
            <div className='row'>
              <ListItem dataSource={articles} />
            </div>
          </div>
        </div>
        <BottomNav />
        <CSSTag style={style} />
      </App>
    )
  }
}

export default withRedux(initStore, (state) => ({
  newsListing: state.newsListing
}))(Index)
