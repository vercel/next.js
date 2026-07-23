import ThemeProvider from '../ui/theme-provider'
import AnalyticsProvider from '../ui/analytics-provider'
import Toaster from '../ui/toaster'

export default function Layout({ children }) {
  return (
    <AnalyticsProvider app="docs" release="2026.07.1">
      <ThemeProvider defaultTheme="system">
        <div className="app-frame" data-app="docs">
          <div className="app-viewport">{children}</div>
        </div>
        <Toaster position="bottom-right" />
      </ThemeProvider>
    </AnalyticsProvider>
  )
}
