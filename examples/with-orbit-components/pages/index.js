import React from 'react'
import { getTokens, Alert, Illustration } from "@kiwicom/orbit-components"

export default () => {
  return (
    <React.Fragment>
      <Alert type="success" spaceAfter="large">It Works!</Alert>
      <Illustration name="Success" />
    </React.Fragment>
  )
}
