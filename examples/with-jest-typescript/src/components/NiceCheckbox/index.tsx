import * as React from 'react'

interface NiceCheckboxProps {
  rootID: string
  id: string
  name: string
  value: string
  label: string
}

const NiceCheckbox: React.SFC<NiceCheckboxProps> = (
  props: NiceCheckboxProps
): JSX.Element => {
  return (
    <div className="NiceCheckbox" id={props.rootID}>
      <input
        type="checkbox"
        id={props.id}
        name={props.name}
        value={props.value}
      />
      <label htmlFor={props.id}>{props.label}</label>
    </div>
  )
}

export default NiceCheckbox
