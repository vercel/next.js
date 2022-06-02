import React from 'react'
import {
  DatePicker,
  DateTimePicker,
  TimePicker,
} from '@atlaskit/datetime-picker'
import { Label } from '@atlaskit/field-base'

export default function DateTimePickerComponent() {
  return (
    <React.Fragment>
      <Label label="TimePicker - timeFormat (h:mm a)" />
      <TimePicker onChange={console.log} timeFormat="h:mm a" />
      <Label label="DatePicker - dateFormat (DD/MM/YYYY)" />
      <DatePicker onChange={console.log} dateFormat="DD/MM/YYYY" />
      <Label label="DateTimePicker - dateFormat (HH:mm) & timeFormat (Do MMMM YYYY)" />
      <DateTimePicker
        onChange={console.log}
        timeFormat="HH:mm"
        dateFormat="Do MMMM YYYY"
      />
    </React.Fragment>
  )
}
