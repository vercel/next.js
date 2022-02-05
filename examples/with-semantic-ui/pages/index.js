import Image from 'next/image'
import * as React from 'react'
import { Button, Header, Modal, Icon } from 'semantic-ui-react'

export default function Home() {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="centered">
      <Icon size="massive" name="world" />
      <div className="separator" />
      <Modal
        onClose={() => setOpen(false)}
        onOpen={() => setOpen(true)}
        open={open}
        trigger={<Button>Show Modal</Button>}
      >
        <Modal.Header>Select a Photo</Modal.Header>
        <Modal.Content image>
          <span style={{ marginRight: 21 }}>
            <Image src="/image.png" width={400} height={266} />
          </span>
          <Modal.Description>
            <Header>Default Profile Image</Header>
            <p>
              We've found the following gravatar image associated with your
              e-mail address.
            </p>
            <p>Is it okay to use this photo?</p>
          </Modal.Description>
        </Modal.Content>
        <Modal.Actions>
          <Button color="black" onClick={() => setOpen(false)}>
            Nope
          </Button>
          <Button
            content="Yep, that's me"
            labelPosition="right"
            icon="checkmark"
            onClick={() => setOpen(false)}
            positive
          />
        </Modal.Actions>
      </Modal>
    </div>
  )
}
