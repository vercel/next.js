import React, { Component } from 'react'
import {
  WhiteSpace,
  List, Switch, Modal, Button, Menu
} from 'antd-mobile'
import Layout from '../components/Layout'
import MenuBar from '../components/MenuBar'

export default class Trick extends Component {
  static getInitialProps ({ req }) {
    const language = req ? req.headers['accept-language'] : navigator.language
    const userAgent = req ? req.headers['user-agent'] : navigator.userAgent
    const android = /android/i.test(userAgent)
    const platform = android ? 'android' : 'ios'

    return {
      language,
      platform
    }
  }

  constructor (props) {
    super(props)

    this.menuData = [
      {
        label: 'Menu 1',
        value: '1',
        children: [
          {
            label: 'Submenu 1-1',
            value: '11'
          },
          {
            label: 'Submenu 1-2',
            value: '12'
          }
        ]
      },
      {
        label: 'Menu 2',
        value: '2',
        children: [
          {
            label: 'Submenu 2-1',
            value: '21'
          },
          {
            label: 'Submenu 2-2',
            value: '22'
          },
          {
            label: 'Submenu 2-3',
            value: '23'
          }
        ]
      }
    ]

    this.state = {
      switchChecked: true,
      modalOpened: false
    }
  }

  render () {
    const {
      language,
      platform,
      url: { pathname }
    } = this.props

    const {
      switchChecked,
      modalOpened
    } = this.state

    return (
      <Layout language={language}>
        <MenuBar
          pathname={pathname}
        >
          <WhiteSpace />
          <List renderHeader={() => 'Switch and Modal platform prop is required in SSR mode'}>
            <List.Item
              extra={
                <Switch
                  platform={platform}
                  checked={switchChecked}
                  onChange={val => this.setState({ switchChecked: val })}
                />
              }
            >
              Switch {platform}
            </List.Item>
            <Button onClick={() => this.setState({ modalOpened: true })}>
              Open {platform} modal
            </Button>
          </List>
          <Modal
            title='Modal'
            platform={platform}
            visible={modalOpened}
            transparent
            closable
            footer={[{ text: 'OK', onPress: () => this.setState({ modalOpened: false }) }]}
            onClose={() => this.setState({ modalOpened: false })}
          >
            I am a modal.<br />
            Must set platform prop
          </Modal>
          <List renderHeader={() => 'Menu height prop is required in SSR mode'}>
            <Menu
              height={500}
              data={this.menuData}
            />
          </List>
        </MenuBar>
      </Layout>
    )
  }
}
