import 'semantic-ui-css/components/modal.css'
import 'semantic-ui-css/components/header.css'
import 'semantic-ui-css/components/button.css'
import 'semantic-ui-css/components/list.css'
import 'semantic-ui-css/components/icon.css'
import 'semantic-ui-css/themes/default/assets/fonts/icons.eot'
import 'semantic-ui-css/themes/default/assets/fonts/icons.woff'
import 'semantic-ui-css/themes/default/assets/fonts/icons.woff2'
import { Modal, Header, Button, List, Icon } from 'semantic-ui-react'
import Head from 'next/head'

export default () => (
  <div>
    <Head>
      <link rel='stylesheet' href='/_next/static/style.css' />
    </Head>
    <Modal trigger={<Button>Show Modal</Button>}>
      <Modal.Header>Select a Photo</Modal.Header>
      <Modal.Content image>
        <Modal.Description>
          <Header>Default Profile Image</Header>
          <p>We've found the following gravatar image associated with your e-mail address.</p>
          <p>Is it okay to use this photo?</p>
        </Modal.Description>
      </Modal.Content>
    </Modal>

    <List vertical relaxed>
      <List.Item>
        <List.Content>
          <List.Header as='a'>Next.js</List.Header>
        </List.Content>
      </List.Item>
      <List.Item>
        <List.Content>
          <List.Header as='a'>React</List.Header>
        </List.Content>
      </List.Item>
      <List.Item>
        <List.Content>
          <List.Header as='a'>Vue.js</List.Header>
        </List.Content>
      </List.Item>
    </List>

    Hello <Icon name='world' />
  </div>
)
