import React from 'react'
import { Button, WhiteSpace, Tag } from 'antd-mobile'
import Layout from '../components/layout'
import router from 'next/router'

class MainPage extends React.Component {
  goNext = () => {
    router.push('/user')
  }

  render() {
    return (
      <Layout active="Index">
        <div>
          <WhiteSpace />
          <h2>Welcome to Next.js </h2>
          <h4>Example for antd-mobile-less.</h4>

          <WhiteSpace />
          <div>
            Change <Tag selected>/layout.less</Tag> (hot-reload)
          </div>
          <p>or</p>
          <div>
            <Tag selected>/default.less</Tag> (restart your app)
          </div>

          <WhiteSpace />
          <WhiteSpace />
          <Button type="primary" onClick={this.goNext}>
            Go Next Tab
          </Button>
        </div>
      </Layout>
    )
  }
}

export default MainPage
