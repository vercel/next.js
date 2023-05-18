/* Instruments */
import './styles/globals.css'

/* Components */
import { Providers } from './providers'

export default function RootLayout(props: React.PropsWithChildren) {
  return (
    <Providers>
      <html lang="en">
        <body>{props.children}</body>
      </html>
    </Providers>
  )
}
