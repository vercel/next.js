import { useState } from 'react'
import { UniversalPortal } from '@jesstelford/react-portal-universal'

const Index = () => {
  const [isOpen, toggle] = useState(true)

  return (
    <>
      {/* A portal that is adjacent to its target */}
      <div id="target" />
      <UniversalPortal selector="#target">
        <h1>Hello Portal</h1>
      </UniversalPortal>

      {/* Open a modal in a portal that is elsewhere in the react tree */}
      <button onClick={() => toggle(!isOpen)} type="button">
        Open Modal
      </button>
      {isOpen && (
        <UniversalPortal selector="#modal">
          <div
            style={{
              position: 'fixed',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
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
                padding: '1em',
              }}
            >
              <p>
                This modal is rendered using{' '}
                <a href="https://www.npmjs.com/package/@jesstelford/react-portal-universal">
                  <code>@jesstelford/react-portal-universal</code>
                </a>
                .
              </p>
              <button type="button" onClick={() => toggle(!isOpen)}>
                Close Modal
              </button>
            </div>
          </div>
        </UniversalPortal>
      )}
    </>
  )
}

export default Index
