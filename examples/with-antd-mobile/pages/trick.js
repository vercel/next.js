import React, {Component} from 'react'
import {
  WhiteSpace,
  List, Radio, Checkbox, Switch, Modal, Button
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
          <List renderHeader={() => 'Components below must set platform prop and cannot be cross'}>
            <List.Item
              arrow='horizontal'
              multipleLine
              platform={platform}
              onClick={() => {}}
            >
              List.Item
            </List.Item>
            <Radio.RadioItem platform={platform}>
              Radio.RadioItem
            </Radio.RadioItem>
            <Checkbox.CheckboxItem platform={platform}>
              Checkbox.CheckboxItem
            </Checkbox.CheckboxItem>
            <List.Item
              platform={platform}
              extra={
                <Switch
                  platform={platform}
                  checked={switchChecked}
                  onChange={val => this.setState({ switchChecked: val })}
                />
              }
            >
             Switch
            </List.Item>
            <Button onClick={() => this.setState({ modalOpened: true })}>
              Open modal
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
        </MenuBar>
      </Layout>
    )
  }
}
