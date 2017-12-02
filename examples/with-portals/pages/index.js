import { Component } from 'react'
import dynamic from 'next/dynamic'

// we import and render the modal only client side (because we need a DOM)
const Modal = dynamic(import('../components/modal'), {
  ssr: false
})

export default class extends Component {
  state = { modal: false };

  toggleModal = () => this.setState(state => ({ modal: !state.modal }))

  render () {
    return (
      <main>
        <button type='button' onClick={this.toggleModal}>
          Open modal
        </button>
        {this.state.modal && (
          <Modal title='My Modal Portal'>
            <p>This is a portal rendered from Next.js</p>
            <button type='button' onClick={this.toggleModal}>
              Close
            </button>
          </Modal>
        )}
      </main>
    )
  }
}
