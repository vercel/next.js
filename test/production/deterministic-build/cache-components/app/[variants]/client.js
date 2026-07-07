'use client'

export const Client = ({ children }) => {
  const value = Date.now()
  return (
    <div>
      {value}
      {children}
    </div>
  )
}
