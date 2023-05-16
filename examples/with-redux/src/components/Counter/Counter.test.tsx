/* Core */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/* Components */
import { Counter } from '@/components'

/* Instruments */
import { renderApp } from '@/lib/tests'

describe('<Counter />', () => {
  test('renders the component', () => {
    renderApp({ children: <Counter /> })

    expect(screen.getByText('0')).toBeInTheDocument()
  })

  test('decrements the value', async () => {
    renderApp({ children: <Counter /> })

    const decrButton = screen.getByRole('button', { name: /decrement value/i })

    await userEvent.click(decrButton)

    expect(screen.getByText('-1')).toBeInTheDocument()
  })

  test('increments the value', async () => {
    renderApp({ children: <Counter /> })

    const incrButton = screen.getByRole('button', { name: /increment value/i })

    await userEvent.click(incrButton)

    expect(screen.getByText('1')).toBeInTheDocument()
  })

  test('increments by amount', async () => {
    renderApp({ children: <Counter /> })

    const setIncrAmountInput = screen.getByLabelText(/set increment amount/i)
    const addAmountButton = screen.getByRole('button', { name: /add amount/i })

    await userEvent.type(setIncrAmountInput, '{backspace}5')
    await userEvent.click(addAmountButton)

    expect(screen.getByText('5')).toBeInTheDocument()
  })

  test('increments async', async () => {
    renderApp({ children: <Counter /> })

    const setIncrAmountInput = screen.getByLabelText(/set increment amount/i)
    const addAsyncButton = screen.getByRole('button', { name: /add async/i })

    await userEvent.type(setIncrAmountInput, '{backspace}3')
    await userEvent.click(addAsyncButton)

    await waitFor(() => {
      expect(screen.findByText('3')).resolves.toBeInTheDocument()
    })
  })

  test('increments if amount is odd', async () => {
    renderApp({ children: <Counter /> })

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
