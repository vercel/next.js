import React from 'react'
import { Checkbox } from '@atlaskit/checkbox'

export default function CheckboxComponent() {
  return (
    <React.Fragment>
      <Checkbox
        value="Basic checkbox"
        label="Basic checkbox"
        onChange={() => {}}
        name="checkbox-basic"
        testId="cb-basic"
      />
      <Checkbox
        isDisabled
        label="Disabled"
        value="Disabled"
        name="checkbox-disabled"
        testId="cb-disabled"
      />
      <Checkbox
        isInvalid
        label="Invalid"
        value="Invalid"
        name="checkbox-invalid"
        testId="cb-invalid"
      />
    </React.Fragment>
  )
}
