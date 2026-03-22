// Combined test for issue-13063
// Tests that side effects optimization doesn't crash with specific vendor patterns

// Test 1: UiSelectButton (from tst_examples_uiform.js)
it('should not crash with UiSelectButton', () => {
  require('./vendors').UiSelectButton()
  require('./vendors').UiSelectButton2()
})

// Test 2: UiButton (from tst_examples_uitable.js)
import { UiButton } from './vendors'

it('should not crash with UiButton', () => {
  UiButton()
})
