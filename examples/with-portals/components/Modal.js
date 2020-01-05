import React, { useState } from 'react'
import ClientOnlyPortal from './ClientOnlyPortal'

export default function Modal() {
  const [open, setOpen] = useState()

  return (
    <React.Fragment>
      <button type="button" onClick={event => setOpen(true)}>
        Open Modal
      </button>
      {open && (
        <ClientOnlyPortal selector="#modal">
          <div className="backdrop">
            <div className="modal">
              <p>
                This modal is rendered using{' '}
                <a
                  href="https://reactjs.org/docs/portals.html"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  portals
                </a>
                .
              </p>
              <button type="button" onClick={event => setOpen(false)}>
                Close Modal
              </button>
            </div>
            <style jsx>{`
              :global(body) {
                overflow: hidden;
              }

              .backdrop {
                position: fixed;
                background-color: rgba(0, 0, 0, 0.7);
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
          </div>
        </ClientOnlyPortal>
      )}
    </React.Fragment>
  )
}
