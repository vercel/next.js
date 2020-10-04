import React from 'react'
import Button, { ButtonGroup } from '@atlaskit/button'

export default function ButtonComponent() {
  return (
    <React.Fragment>
      <Button style={{ margin: 10 }}>Button</Button>
      <Button style={{ margin: 10 }} appearance="primary">
        Primary Button
      </Button>
      <Button style={{ margin: 10 }} appearance="danger">
        Danger Button
      </Button>
      <Button style={{ margin: 10 }} appearance="warning">
        Warning Button
      </Button>
      <Button style={{ margin: 10 }} appearance="link">
        Link Button
      </Button>
      <Button style={{ margin: 10 }} isDisabled>
        Disabled Button
      </Button>
      <ButtonGroup appearance="primary">
        <Button>First Button</Button>
        <Button>Second Button</Button>
        <Button>Third Button</Button>
      </ButtonGroup>
    </React.Fragment>
  )
}
