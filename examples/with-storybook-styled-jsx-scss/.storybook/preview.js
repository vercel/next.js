import { StyleRegistry } from 'styled-jsx'

export const decorators = [
  (Story) => (
    <StyleRegistry>
      <Story />
    </StyleRegistry>
  ),
]

export const parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
}
