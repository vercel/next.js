import * as React from 'react'

export type DialogHeaderProps = React.HTMLAttributes<HTMLDivElement>

const DialogHeader: React.FC<DialogHeaderProps> = function DialogHeader(props) {
  return (
    <div data-nextjs-dialog-header {...props}>
      {props.children}
    </div>
  )
}

export { DialogHeader }
