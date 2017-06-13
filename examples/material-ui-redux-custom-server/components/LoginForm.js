import React from 'react'
import RaisedButton from 'material-ui/RaisedButton'
import TextField from 'material-ui/TextField'

function LoginForm (props) {
  return (
    <div>
      <div style={{ marginBottom: 15 }}>
        <TextField
          fullWidth
          hintText='Username'
          floatingLabelText='Username'
        />
      </div>
      <div style={{ marginBottom: 30 }}>
        <TextField
          fullWidth
          hintText='Password'
          floatingLabelText='Password'
          type='password'
        />
      </div>
      <div style={{ marginBottom: 15 }}>
        <RaisedButton primary label='Submit' fullWidth />
      </div>
    </div>
  )
}

export default LoginForm
