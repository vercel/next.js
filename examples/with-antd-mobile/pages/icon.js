import React, { Component } from 'react'
import { WhiteSpace, WingBlank, Card, Icon } from 'antd-mobile'
import Layout from '../components/Layout'
import MenuBar from '../components/MenuBar'

export default class Home extends Component {
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
            <WhiteSpace />
            <Card>
              <Card.Header
                extra='Internal svg'
                thumb={<Icon type='check' />}
              />
              <Card.Body>
                <code>
                  {`<Icon type='check' />`}
                </code>
              </Card.Body>
            </Card>
            <WhiteSpace />
            <Card>
              <Card.Header
                extra='Custom svg'
                thumb={<Icon type={require('../static/reload.svg')} />}
              />
              <Card.Body>
                <code>
                  {`<Icon type={require('../static/reload.svg')} />`}
                </code>
              </Card.Body>
            </Card>
            <WhiteSpace />
            <Card>
              <Card.Header
                extra='Fill color'
                thumb={
                  <Icon
                    type={require('../static/reload.svg')}
                    style={{ fill: '#108ee9' }}
                  />
                }
              />
              <Card.Body>
                <code>{`
                  <Icon
                    type={require('../static/reload.svg')}
                    style={{ fill: '#108ee9' }}
                  />
                `}</code>
              </Card.Body>
            </Card>
            <style jsx>{`
              code {
                color: gray;
              }
            `}</style>
          </WingBlank>
        </MenuBar>
      </Layout>
    )
  }
}
