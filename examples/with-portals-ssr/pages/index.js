import * as React from 'react'
import { UniversalPortal } from '@jesstelford/react-portal-universal'

export default class Index extends React.Component {
  constructor () {
    super(...arguments)
    this.state = { opened: true }
  }

  open = () => {
    this.setState({ opened: true })
  }

  close = () => {
    this.setState({ opened: false })
  }

  render () {
    return (
      <React.Fragment>
        {/* A portal that is adjacent to its target */}
        <div id='target' />
        <UniversalPortal selector='#target'>
          <h1>Hello Portal</h1>
        </UniversalPortal>

        {/* Open a modal in a portal that is elsewhere in the react tree */}
        <button type='button' onClick={this.open}>
          Open Modal
        </button>
        {this.state.opened && (
          <UniversalPortal selector='#modal'>
            <div
              style={{
                position: 'fixed',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0
              }}
            >
              <div
                style={{
                  backgroundColor: 'white',
                  position: 'absolute',
                  top: '10%',
                  right: '10%',
                  bottom: '10%',
                  left: '10%',
                  padding: '1em'
                }}
              >
                <p>
                  This modal is rendered using{' '}
                  <a href='https://www.npmjs.com/package/@jesstelford/react-portal-universal'>
                    <code>@jesstelford/react-portal-universal</code>
                  </a>
                  .
                </p>
                <button type='button' onClick={this.close}>
                  Close Modal
                </button>
              </div>
            </div>
          </UniversalPortal>
        )}
      </React.Fragment>
    )
  }
}
