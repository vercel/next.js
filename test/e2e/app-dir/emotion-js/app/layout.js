import EmotionRootStyleRegistry from './emotion-root-style-registry'

export default function RootLayout({ children }) {
  return (
    <html>
      <head></head>
      <body>
        <EmotionRootStyleRegistry>{children}</EmotionRootStyleRegistry>
      </body>
    </html>
  )
}
