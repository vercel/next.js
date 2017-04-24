import React, {Component} from 'react'
import {
  WingBlank
} from 'antd-mobile'
import Layout from '../components/Layout'
import MenuBar from '../components/MenuBar'

export default class Unsupported extends Component {
  static getInitialProps ({ req }) {
    const language = req ? req.headers['accept-language'] : navigator.language

    return {
      language
    }
  }

  render () {
    const {
      language,
      url: { pathname }
    } = this.props

    return (
      <Layout language={language}>
        <MenuBar
          pathname={pathname}
        >
          <WingBlank>
            <ol>
              <li>Menu</li>
              <li>RefreshControl</li>
            </ol>
          </WingBlank>
        </MenuBar>
      </Layout>
    )
  }
}
