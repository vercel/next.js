'use client'

export function Button({
  action,
  children,
}: {
  action: any
  children: React.ReactNode
}) {
  return (
    <button id="action-button" onClick={action.bind(null, 42)}>
      {children}
    </button>
  )
}
