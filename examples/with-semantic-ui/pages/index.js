import Head from 'next/head'
import { Modal, Header, Button, List } from 'semantic-ui-react'

export default () => (
  <div>
    <Head>
      <link rel='stylesheet' href='//cdnjs.cloudflare.com/ajax/libs/semantic-ui/2.2.2/semantic.min.css' />
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
  </div>
)
