import React, {Component} from 'react'
import Button from 'material-ui/Button'
import Dialog, {
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from 'material-ui/Dialog'
import Typography from 'material-ui/Typography'
import App from '../components/App'

const styles = {
  container: {
    textAlign: 'center',
    paddingTop: 200
  }
}

class Index extends Component {
  state = {
    open: false
  };

  handleRequestClose = () => {
    this.setState({
      open: false
    })
  };

  handleClick = () => {
    this.setState({
      open: true
    })
  };

  render () {
    return (
      <App>
        <div style={styles.container}>
          <Dialog open={this.state.open} onRequestClose={this.handleRequestClose}>
            <DialogTitle>Super Secret Password</DialogTitle>
            <DialogContent>
              <DialogContentText>1-2-3-4-5</DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button color='primary' onClick={this.handleRequestClose}>OK</Button>
            </DialogActions>
          </Dialog>
          <Typography type='display1' gutterBottom>Material-UI</Typography>
          <Typography type='subheading' gutterBottom>example project</Typography>
          <Button raised color='accent' onClick={this.handleClick}>
            Super Secret Password
          </Button>
        </div>
      </App>
    )
  }
}

export default Index
