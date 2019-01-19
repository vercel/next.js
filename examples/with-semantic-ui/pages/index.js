import 'semantic-ui-css/semantic.min.css'
import { Modal, Header, Button, List, Icon } from 'semantic-ui-react'

export default () => (
  <div>
    <Modal trigger={<Button>Show Modal</Button>}>
      <Modal.Header>Select a Photo</Modal.Header>
      <Modal.Content image>
        <Modal.Description>
          <Header>Default Profile Image</Header>
          <p>
            We have found the following gravatar image associated with your
            e-mail address.
          </p>
          <p>Is it okay to use this photo?</p>
        </Modal.Description>
      </Modal.Content>
    </Modal>
    <List relaxed>
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
