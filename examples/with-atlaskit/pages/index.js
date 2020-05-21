import React from 'react'
import ButtonComponent from '../components/ButtonComponent'
import CheckboxComponent from '../components/CheckboxComponent'
import DateTimePickerComponent from '../components/DateTimePickerComponent'
import DropdownMenuComponent from '../components/DropdownMenuComponent'

export default function Home() {
  return (
    <React.Fragment>
      <ButtonComponent />
      <CheckboxComponent />
      <DateTimePickerComponent />
      <DropdownMenuComponent />
    </React.Fragment>
  )
}
