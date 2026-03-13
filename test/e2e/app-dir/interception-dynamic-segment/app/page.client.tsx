'use client'

import Link from 'next/link'
import { useState } from 'react'

export function LinkAccordion({ href }: { href: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div
      data-testid="link-accordion"
      data-href={href}
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '16px',
        margin: '12px 0',
        backgroundColor: 'white',
        boxShadow:
          '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#374151',
            fontWeight: '500',
            flex: 1,
          }}
        >
          {href}
        </div>
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#3b82f6',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>▶</span>
            Open
          </button>
        )}
      </div>
      {isOpen && (
        <div
          style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid #e5e7eb',
          }}
        >
          <Link
            href={href}
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              backgroundColor: '#10b981',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            Navigate to {href}
          </Link>
        </div>
      )}
    </div>
  )
}
