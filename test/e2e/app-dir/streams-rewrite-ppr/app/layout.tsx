import LayoutServerHTML from './LayoutServerHTML'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <LayoutServerHTML>
      <html>
        <body>{children}</body>
      </html>
    </LayoutServerHTML>
  )
}
