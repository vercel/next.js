// This file can be changed to use any other Toast Component.
import React from 'react'
import MaterialSnackbar, {
  SnackbarProps as _SnackbarProps,
} from '@material-ui/core/Snackbar'
import IconButton from '@material-ui/core/IconButton'
import CloseIcon from '@material-ui/icons/Close'

export interface SnackbarProps extends _SnackbarProps {
  key?: string
}

export default MaterialSnackbar

let key = 1
export function generateSnackMessage(
  {
    message,
    action,
  }: {
    message: React.ReactNode
    action?: React.ReactNode
  },
  showSnackMessage: (props: SnackbarProps) => void
): SnackbarProps {
  return {
    key: (key++).toString(10),
    open: true,
    ContentProps: {
      'aria-describedby': 'message-id',
    },
    message: <span id="message-id">{message}</span>,
    action: (
      <>
        {action}
        <IconButton
          key="close"
          aria-label="close"
          color="inherit"
          onClick={() => showSnackMessage({ open: false })}
        >
          <CloseIcon />
        </IconButton>
      </>
    ),
  }
}
