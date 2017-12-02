import { Component } from 'react'
import { createPortal } from 'react-dom'

export default class extends Component {
  componentWillMount () {
    // get the mount point, is because of this why the modal
    // can't be used server side, we need access to the DOM
    this.modalRoot = document.getElementById('modal')
  }

  render () {
    const { title, children } = this.props

    return createPortal(
      <div className='overlay'>
        <div className='modal'>
          <h2>{title}</h2>
          {children}
        </div>
        <style jsx global>{`
          body {
            /* this avoid any possible scroll on the body */
            overflow: hidden;
          }
        `}</style>
        <style jsx>{`
          .overlay {
            position: fixed;
            background-color: rgba(0, 0, 0, .7);
            top: 0;
            right: 0;
            bottom: 0;
            left: 0;
          }

          .modal {
            background-color: white;
            position: absolute;
            top: 10%;
            right: 10%;
            bottom: 10%;
            left: 10%;
            padding: 1em;
          }
        `}</style>
      </div>,
      this.modalRoot
    )
  }
}
