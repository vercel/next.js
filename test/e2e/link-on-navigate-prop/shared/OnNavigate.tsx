import Link from 'next/link'
import { useState } from 'react'
import React from 'react'

interface OnNavigateProps {
  children: React.ReactNode
  rootPath: string
}

export default function OnNavigate({ children, rootPath }: OnNavigateProps) {
  const [isClicked, setIsClicked] = useState(false)
  const [isNavigated, setIsNavigated] = useState(false)
  const [isLocked, setIsLocked] = useState(false)

  return (
    <div>
      <nav>
        <div id="navigation-state">
          <p id="is-clicked">isClicked: {isClicked ? 'true' : 'false'}</p>
          <p id="is-navigated">isNavigated: {isNavigated ? 'true' : 'false'}</p>
          <p id="is-locked">isLocked: {isLocked ? 'true' : 'false'}</p>
        </div>
        <button id="toggle-lock" onClick={() => setIsLocked(!isLocked)}>
          {isLocked ? 'Unlock' : 'Lock'}
        </button>

        <div>
          <Link
            href={rootPath}
            id="link-to-main"
            onClick={() => setIsClicked(true)}
            onNavigate={(e: any) => {
              if (isLocked) {
                e.preventDefault()
              } else {
                setIsNavigated(true)
              }
            }}
          >
            Client Side Navigation to Main Page
          </Link>
        </div>

        <div>
          <Link
            href={`${rootPath}/subpage`}
            id="link-to-subpage"
            onClick={() => setIsClicked(true)}
            onNavigate={(e: any) => {
              if (isLocked) {
                e.preventDefault()
              } else {
                setIsNavigated(true)
              }
            }}
          >
            Client Side Navigation to Subpage
          </Link>
        </div>

        <div>
          <Link
            href="https://nextjs.org"
            id="external-link-with-target"
            onClick={() => setIsClicked(true)}
            onNavigate={() => setIsNavigated(true)}
            target="_blank"
          >
            External Link with Target
          </Link>
        </div>

        <div>
          <Link
            href="https://nextjs.org"
            id="external-link"
            onClick={() => alert('onClick')}
            onNavigate={() => alert('onNavigate')}
          >
            External Link
          </Link>
        </div>

        <div>
          <Link
            href="https://nextjs.org"
            id="external-link-with-replace"
            onClick={() => alert('onClick')}
            onNavigate={() => alert('onNavigate')}
            replace
          >
            External Link with replace
          </Link>
        </div>

        <div>
          <Link
            download
            href="/zip.zip"
            id="download-link"
            onClick={() => setIsClicked(true)}
            onNavigate={() => {
              setIsNavigated(true)
            }}
          >
            Download Link with download attribute
          </Link>
        </div>
      </nav>

      <div id="content" style={{ border: '1px solid red' }}>
        {children}
      </div>
    </div>
  )
}
