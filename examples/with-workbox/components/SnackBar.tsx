import React from 'react'
import MaterialSnackbar, {
  SnackbarProps as _SnackbarProps,
} from '@material-ui/core/Snackbar'
import IconButton from '@material-ui/core/IconButton'
import CloseIcon from '@material-ui/icons/Close'

interface SnackbarProps extends _SnackbarProps {
  key?: string
}

export const SnackbarMessageContext = React.createContext<SnackbarWrapperState>(
  {
    options: null,
    showSnackMessage: () => {},
  }
)

export interface SnackbarWrapperState {
  options: SnackbarProps | null
  showSnackMessage: (options: SnackbarProps) => void
}

export class SnackbarProvider extends React.PureComponent {
  state: SnackbarWrapperState = {
    options: null,
    showSnackMessage: options => {
      this.setState({ options })
    },
  }
  render() {
    return (
      <SnackbarMessageContext.Provider value={this.state}>
        {this.props.children}
      </SnackbarMessageContext.Provider>
    )
  }
}

export class Snackbar extends React.PureComponent<SnackbarProps> {
  render() {
    return (
      <SnackbarMessageContext.Consumer>
        {({ options }) => <MaterialSnackbar {...this.props} {...options} />}
      </SnackbarMessageContext.Consumer>
    )
  }
}

let key = 1
export function generateSnackMessage(
  {
    message,
    action,
  }: {
    message: React.ReactNode
    action?: React.ReactNode
  },
  showSnackMessage: SnackbarWrapperState['showSnackMessage']
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
