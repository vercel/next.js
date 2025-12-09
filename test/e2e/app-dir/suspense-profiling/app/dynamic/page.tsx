import { Suspense } from 'react'
import { cookies, headers } from 'next/headers'
import { connection } from 'next/server'

// =============================================================================
// Component wrappers to create depth between Suspense and dynamic API
// =============================================================================

function Dashboard({ children }: { children: React.ReactNode }) {
  return <div className="dashboard">{children}</div>
}

function UserSection({ children }: { children: React.ReactNode }) {
  return <div className="user-section">{children}</div>
}

function UserProfile({ children }: { children: React.ReactNode }) {
  return <div className="user-profile">{children}</div>
}

function ProfileSettings({ children }: { children: React.ReactNode }) {
  return <div className="profile-settings">{children}</div>
}

function SettingsPanel({ children }: { children: React.ReactNode }) {
  return <div className="settings-panel">{children}</div>
}

function PreferencesForm({ children }: { children: React.ReactNode }) {
  return <div className="preferences-form">{children}</div>
}

function FormFields({ children }: { children: React.ReactNode }) {
  return <div className="form-fields">{children}</div>
}

function RequestHandler({ children }: { children: React.ReactNode }) {
  return <div className="request-handler">{children}</div>
}

function NetworkLayer({ children }: { children: React.ReactNode }) {
  return <div className="network-layer">{children}</div>
}

function DataProvider({ children }: { children: React.ReactNode }) {
  return <div className="data-provider">{children}</div>
}

// =============================================================================
// Case 1: cookies() - Deep nesting (7 layers)
// Dashboard > UserSection > UserProfile > ProfileSettings > SettingsPanel > PreferencesForm > FormFields > CookieReader
// =============================================================================
async function CookieReader() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  return (
    <div data-testid="cookie-content">
      Cookie count: {allCookies.length}
    </div>
  )
}

function DeepCookieContent() {
  return (
    <Dashboard>
      <UserSection>
        <UserProfile>
          <ProfileSettings>
            <SettingsPanel>
              <PreferencesForm>
                <FormFields>
                  <CookieReader />
                </FormFields>
              </PreferencesForm>
            </SettingsPanel>
          </ProfileSettings>
        </UserProfile>
      </UserSection>
    </Dashboard>
  )
}

// =============================================================================
// Case 2: headers() - Medium nesting (3 layers)
// RequestHandler > NetworkLayer > DataProvider > HeaderReader
// =============================================================================
async function HeaderReader() {
  const headersList = await headers()
  const userAgent = headersList.get('user-agent') || 'Unknown'
  return (
    <div data-testid="header-content">
      User Agent: {userAgent.slice(0, 50)}...
    </div>
  )
}

function HeaderContent() {
  return (
    <RequestHandler>
      <NetworkLayer>
        <DataProvider>
          <HeaderReader />
        </DataProvider>
      </NetworkLayer>
    </RequestHandler>
  )
}

// =============================================================================
// Case 3: connection() - Medium nesting (2 layers)
// ApiClient > ConnectionHandler > ConnectionReader
// =============================================================================
function ApiClient({ children }: { children: React.ReactNode }) {
  return <div className="api-client">{children}</div>
}

function ConnectionHandler({ children }: { children: React.ReactNode }) {
  return <div className="connection-handler">{children}</div>
}

async function ConnectionReader() {
  await connection()
  return (
    <div data-testid="connection-content">
      Connection established at: {Date.now()}
    </div>
  )
}

function ConnectionContent() {
  return (
    <ApiClient>
      <ConnectionHandler>
        <ConnectionReader />
      </ConnectionHandler>
    </ApiClient>
  )
}

// =============================================================================
// Case 4: Direct dynamic call (same level - optimal)
// =============================================================================
async function DirectHeaderContent() {
  const headersList = await headers()
  return (
    <div data-testid="direct-header-content">
      Direct header access: {headersList.get('host')}
    </div>
  )
}

// =============================================================================
// Case 5: Static async content (for comparison - no dynamic API)
// =============================================================================
async function StaticAsyncContent() {
  await new Promise((resolve) => setTimeout(resolve, 50))
  return (
    <div data-testid="static-async-content">
      This content is static async
    </div>
  )
}

export default function DynamicPage() {
  return (
    <div data-testid="dynamic-page-root" style={{ padding: '20px' }}>
      <h1>Dynamic API Layer Demo</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Open the profiler panel to see component layers between Suspense and
        dynamic API calls. Click "prompt" to copy optimization suggestions.
      </p>

      <section style={{ marginBottom: '24px' }}>
        <h2>1. Deep nesting - 7 layers to cookies()</h2>
        <Suspense
          fallback={<div data-testid="cookie-loading">Loading cookies...</div>}
        >
          <DeepCookieContent />
        </Suspense>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <h2>2. Medium nesting - 3 layers to headers()</h2>
        <Suspense
          fallback={<div data-testid="header-loading">Loading headers...</div>}
        >
          <HeaderContent />
        </Suspense>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <h2>3. Medium nesting - 2 layers to connection()</h2>
        <Suspense
          fallback={
            <div data-testid="connection-loading">Loading connection...</div>
          }
        >
          <ConnectionContent />
        </Suspense>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <h2>4. Direct call - headers() at same level (optimal)</h2>
        <Suspense
          fallback={
            <div data-testid="direct-header-loading">Loading direct...</div>
          }
        >
          <DirectHeaderContent />
        </Suspense>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <h2>5. Static async (no dynamic API)</h2>
        <Suspense
          fallback={
            <div data-testid="static-async-loading">Loading static...</div>
          }
        >
          <StaticAsyncContent />
        </Suspense>
      </section>
    </div>
  )
}
