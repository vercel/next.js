import React from 'react'
import DropdownMenu, {
  DropdownItemGroup,
  DropdownItem,
} from '@atlaskit/dropdown-menu'
import { Label } from '@atlaskit/field-base'

export default function DropdownMenuComponent() {
  return (
    <React.Fragment>
      <Label label="DropdownMenu" />
      <DropdownMenu trigger="Cities in Australia" triggerType="button">
        <DropdownItemGroup>
          <DropdownItem>Sydney</DropdownItem>
          <DropdownItem>Melbourne</DropdownItem>
          <DropdownItem>Adelaide</DropdownItem>
          <DropdownItem>Perth</DropdownItem>
          <DropdownItem>Brisbane</DropdownItem>
          <DropdownItem>Canberra</DropdownItem>
          <DropdownItem>Hobart</DropdownItem>
          <DropdownItem>Darwin</DropdownItem>
        </DropdownItemGroup>
      </DropdownMenu>
    </React.Fragment>
  )
}
