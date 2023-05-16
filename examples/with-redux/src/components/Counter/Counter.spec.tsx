/* Core */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'

/* Components */
import { Counter } from './Counter'

/* Instruments */
import { makeStore } from '@/lib/redux'

jest.mock('./counterAPI', () => ({
  fetchCount: (amount: number) =>
    new Promise<{ data: number }>((resolve) =>
      setTimeout(() => resolve({ data: amount }), 500)
    ),
}))

const renderApp = () => {
  const store = makeStore()

  render(
    <Provider store={store}>
      <Counter />
    </Provider>
  )
}

describe('<Counter />', () => {
  it('renders the component', () => {
    renderApp()

    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('decrements the value', async () => {
    renderApp()

    const decrButton = screen.getByRole('button', { name: /decrement value/i })

    await userEvent.click(decrButton)

    expect(screen.getByText('-1')).toBeInTheDocument()
  })

  it('increments the value', async () => {
    renderApp()

    const incrButton = screen.getByRole('button', { name: /increment value/i })

    await userEvent.click(incrButton)

    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('increments by amount', async () => {
    renderApp()

    const setIncrAmountInput = screen.getByLabelText(/set increment amount/i)
    const addAmountButton = screen.getByRole('button', { name: /add amount/i })

    await userEvent.type(setIncrAmountInput, '{backspace}5')
    await userEvent.click(addAmountButton)

    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('increments async', async () => {
    renderApp()

    const setIncrAmountInput = screen.getByLabelText(/set increment amount/i)
    const addAsyncButton = screen.getByRole('button', { name: /add async/i })

    await userEvent.type(setIncrAmountInput, '{backspace}3')
    await userEvent.click(addAsyncButton)
    await expect(screen.findByText('3')).resolves.toBeInTheDocument()
  })

  it('increments if amount is odd', async () => {
    renderApp()

    const setIncrAmountInput = screen.getByLabelText(/set increment amount/i)
    const addIfOddButton = screen.getByRole('button', { name: /add if odd/i })
    const incrButton = screen.getByRole('button', { name: /increment value/i })

    await userEvent.click(addIfOddButton)
    expect(screen.getByText('0')).toBeInTheDocument()
    await userEvent.click(incrButton)
    await userEvent.type(setIncrAmountInput, '{backspace}8')
    await userEvent.click(addIfOddButton)
    await expect(screen.findByText('9')).resolves.toBeInTheDocument()
  })
})
