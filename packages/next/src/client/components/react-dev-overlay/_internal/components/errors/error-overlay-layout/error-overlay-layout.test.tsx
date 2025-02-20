/**
 * @jest-environment jsdom
 */
/* eslint-disable import/no-extraneous-dependencies */
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ErrorOverlayLayout } from './error-overlay-layout'
import '@testing-library/jest-dom'

// Mock maintain--tab-focus module
jest.mock('../../../components/overlay/maintain--tab-focus', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    disengage: jest.fn(),
  })),
}))

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

const renderTestComponent = () => {
  return render(
    <ErrorOverlayLayout
      errorType="Build Error"
      errorMessage="Failed to compile"
      errorCode="E001"
      error={new Error('Sample error')}
      isBuildError={true}
      onClose={() => {}}
      rendered={true}
      transitionDurationMs={200}
      isTurbopack={false}
      versionInfo={{
        installed: '15.0.0',
        staleness: 'fresh',
      }}
    >
      Module not found: Cannot find module './missing-module'
    </ErrorOverlayLayout>
  )
}

describe('ErrorOverlayLayout Component', () => {
  beforeEach(() => {
    // Mock fetch
    global.fetch = jest.fn(() => {
      return Promise.resolve({
        ok: true,
        headers: new Headers(),
        redirected: false,
        status: 200,
        statusText: 'OK',
        type: 'basic',
        url: '',
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
        blob: () => Promise.resolve(new Blob()),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        formData: () => Promise.resolve(new FormData()),
        clone: () => new Response(),
      } as Response)
    }) as jest.Mock
  })

  test('renders ErrorOverlayLayout with provided props', () => {
    renderTestComponent()
    expect(screen.getByText('Failed to compile')).toBeInTheDocument()
    expect(
      screen.getByText(
        "Module not found: Cannot find module './missing-module'"
      )
    ).toBeInTheDocument()
  })
  test('voting buttons have aria-hidden icons', () => {
    renderTestComponent()

    const helpfulButton = screen.getByRole('button', {
      name: 'Mark as helpful',
    })
    const notHelpfulButton = screen.getByRole('button', {
      name: 'Mark as not helpful',
    })

    expect(helpfulButton.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
    expect(notHelpfulButton.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })

  test('sends feedback when clicking helpful button', async () => {
    renderTestComponent()

    expect(
      screen.queryByText('Thanks for your feedback!')
    ).not.toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark as helpful' }))
    })

    expect(fetch).toHaveBeenCalledWith(
      '/__nextjs_error_feedback?errorCode=E001&wasHelpful=true'
    )

    expect(screen.getByText('Thanks for your feedback!')).toBeInTheDocument()
  })

  test('sends feedback when clicking not helpful button', async () => {
    renderTestComponent()

    expect(
      screen.queryByText('Thanks for your feedback!')
    ).not.toBeInTheDocument()

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Mark as not helpful' })
      )
    })

    expect(fetch).toHaveBeenCalledWith(
      '/__nextjs_error_feedback?errorCode=E001&wasHelpful=false'
    )

    expect(screen.getByText('Thanks for your feedback!')).toBeInTheDocument()
  })
})
