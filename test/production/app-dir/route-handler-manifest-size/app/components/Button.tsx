'use client'

export function Button({ children }: { children: React.ReactNode }) {
  return (
    <button
      onClick={() => console.log('Button clicked')}
      className="px-4 py-2 bg-blue-500 text-white rounded"
    >
      {children}
    </button>
  )
}
