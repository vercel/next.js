import React, {Component} from 'react'
import {
  WhiteSpace, WingBlank,
  NavBar, Icon, Pagination, Steps
} from 'antd-mobile'
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
          <NavBar
            leftContent='back'
            mode='light'
            onLeftClick={() => console.log('onLeftClick')}
            rightContent={[
              <Icon key='0' type='search' style={{ marginRight: '0.32rem' }} />,
              <Icon key='1' type='ellipsis' />
            ]}
          >
            NavBar
          </NavBar>
          <WhiteSpace />
          <Pagination total={5} current={0} />
          <WhiteSpace />
          <WingBlank>
            <Steps current={1}>
              <Steps.Step title='Finished' description='Most components has supported' />
              <Steps.Step title='In Progress' description='Switch Modal and Menu' />
              <Steps.Step title='Waiting' description='1.2.0' />
            </Steps>
          </WingBlank>
        </MenuBar>
      </Layout>
    )
  }
}
