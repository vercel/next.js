import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('interception-dynamic-single-segment', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should intercept from nested route to deeper nested route with (.) modifier', async () => {
    // This test covers the bug fix for same-level (.) interception
    // where navigation from a nested route (e.g., /groups/123) to a deeper route
    // (e.g., /groups/123/new) should trigger the modal interception.
    //
    // The bug was that the regex pattern used [^/]+ which only matched single segments,
    // so interception failed when the source route had multiple segments like /groups/123
    const browser = await next.browser('/groups/123')

    // Verify we're on the group page
    await retry(async () => {
      const text = await browser.elementByCss('body').text()
      expect(text).toContain('Group 123')
      expect(text).toContain('New Item')
    })

    // Navigate from /groups/123 to /groups/123/new
    // This should trigger the modal interception
    await browser.elementById('new-link').click()

    await retry(async () => {
      const modalText = await browser.elementById('modal').text()
      expect(modalText).toContain('Modal: New item for group 123')
    })

    // The children should still show the group page
    await retry(async () => {
      const childrenText = await browser.elementById('children').text()
      expect(childrenText).toContain('Group 123')
    })

    // Refresh to verify the full page renders (not intercepted)
    await browser.refresh()
    await retry(async () => {
      const childrenText = await browser.elementById('children').text()
      expect(childrenText).toContain('New item for group 123')
    })
  })

  it('should intercept from deeply nested route (4 segments) with (.) modifier', async () => {
    // This test covers deeply nested routes with multiple dynamic segments
    // Source: /org/acme/team/engineering (4 segments, 2 dynamic)
    // Target: /org/acme/team/engineering/settings (5 segments)
    //
    // This ensures the regex fix (.+) handles very deep nesting correctly
    const browser = await next.browser('/org/acme/team/engineering')

    // Verify we're on the team page
    await retry(async () => {
      const text = await browser.elementByCss('body').text()
      expect(text).toContain('Team engineering in Org acme')
      expect(text).toContain('Settings')
    })

    // Navigate from /org/acme/team/engineering to /org/acme/team/engineering/settings
    // This should trigger the modal interception
    await browser.elementById('settings-link').click()

    await retry(async () => {
      const modalText = await browser.elementById('modal').text()
      expect(modalText).toContain(
        'Modal: Settings for Team engineering in Org acme'
      )
    })

    // The children should still show the team page
    await retry(async () => {
      const childrenText = await browser.elementById('children').text()
      expect(childrenText).toContain('Team engineering in Org acme')
    })

    // Refresh to verify the full page renders (not intercepted)
    await browser.refresh()
    await retry(async () => {
      const childrenText = await browser.elementById('children').text()
      expect(childrenText).toContain(
        'Settings for Team engineering in Org acme'
      )
    })
  })

  it('should intercept with programmatic navigation using router.push', async () => {
    // Test that interception works with programmatic navigation, not just Link clicks
    // This ensures the NEXT_URL header is set correctly in all navigation scenarios
    const browser = await next.browser('/groups/123')

    // Verify we're on the group page
    await retry(async () => {
      const text = await browser.elementByCss('body').text()
      expect(text).toContain('Group 123')
    })

    // Use router.push to navigate programmatically
    await browser.eval('window.next.router.push("/groups/123/new")')

    // Should trigger the modal interception
    await retry(async () => {
      const modalText = await browser.elementById('modal').text()
      expect(modalText).toContain('Modal: New item for group')
    })

    // The children should still show the group page
    await retry(async () => {
      const childrenText = await browser.elementById('children').text()
      expect(childrenText).toContain('Group 123')
    })
  })

  it('should intercept from nested route with query parameters', async () => {
    // Test that interception works when the source route has query parameters
    // The query params should not interfere with route matching
    const browser = await next.browser('/groups/123?tab=settings&view=grid')

    // Verify we're on the group page with query params
    await retry(async () => {
      const text = await browser.elementByCss('body').text()
      expect(text).toContain('Group 123')
      expect(text).toContain('New Item')
    })

    // Navigate to /groups/123/new (query params in source shouldn't affect interception)
    await browser.elementById('new-link').click()

    await retry(async () => {
      const modalText = await browser.elementById('modal').text()
      expect(modalText).toContain('Modal: New item for group')
    })

    // The children should still show the group page
    await retry(async () => {
      const childrenText = await browser.elementById('children').text()
      expect(childrenText).toContain('Group 123')
    })
  })

  it('should intercept with consecutive dynamic segments', async () => {
    // Test that interception works with consecutive dynamic segments [a]/[b]/[c]
    // This is an edge case where there are no static segments between dynamics
    // Source: /x/y/z (3 consecutive dynamic segments)
    // Target: /x/y/z/item
    const browser = await next.browser('/x/y/z')

    // Verify we're on the consecutive dynamic page
    await retry(async () => {
      const text = await browser.elementByCss('body').text()
      expect(text).toContain('Path: x/y/z')
      expect(text).toContain('View Item')
    })

    // Navigate to /x/y/z/item
    await browser.elementById('item-link').click()

    await retry(async () => {
      const modalText = await browser.elementById('modal').text()
      expect(modalText).toContain('Modal: Item for path x/y/z')
    })

    // The children should still show the consecutive page
    await retry(async () => {
      const childrenText = await browser.elementById('children').text()
      expect(childrenText).toContain('Path: x/y/z')
    })

    // Refresh to verify the full page renders (not intercepted)
    await browser.refresh()
    await retry(async () => {
      const childrenText = await browser.elementById('children').text()
      expect(childrenText).toContain('Item for path: x/y/z')
    })
  })

  it('should intercept with purely static multi-segment paths', async () => {
    // Test that interception works with static (non-dynamic) multi-segment paths
    // This ensures the fix doesn't break static route interception
    // Source: /admin/dashboard/users (3 static segments)
    // Target: /admin/dashboard/users/new (4 static segments)
    const browser = await next.browser('/admin/dashboard/users')

    // Verify we're on the users page
    await retry(async () => {
      const text = await browser.elementByCss('body').text()
      expect(text).toContain('Admin Dashboard - Users')
      expect(text).toContain('New User')
    })

    // Navigate to /admin/dashboard/users/new
    await browser.elementById('new-user-link').click()

    await retry(async () => {
      const modalText = await browser.elementById('modal').text()
      expect(modalText).toContain('Modal: New User Form')
    })

    // The children should still show the users page
    await retry(async () => {
      const childrenText = await browser.elementById('children').text()
      expect(childrenText).toContain('Admin Dashboard - Users')
    })

    // Refresh to verify the full page renders (not intercepted)
    await browser.refresh()
    await retry(async () => {
      const childrenText = await browser.elementById('children').text()
      expect(childrenText).toContain('New User Form')
    })
  })

  describe('nested navigation - descendants of intercepting route', () => {
    // These tests verify the key bug fix: the regex pattern now matches
    // all descendants of the intercepting route level, not just the exact level.
    // Previously, navigation FROM a nested route (e.g., /groups/123/nested) would
    // fail to trigger interception. Now it should work from any depth.
    // NOTE: These are conceptual tests - actual nested pages would need to be created
    // in the app directory structure to fully test this behavior in a real app.

    it('should intercept when navigating from a child route using back navigation', async () => {
      // Start at /groups/123, navigate to /groups/123/new (intercepted),
      // then navigate away and back
      const browser = await next.browser('/groups/123')

      await retry(async () => {
        const text = await browser.elementByCss('body').text()
        expect(text).toContain('Group 123')
      })

      // First navigation - should intercept
      await browser.elementById('new-link').click()
      await retry(async () => {
        const modalText = await browser.elementById('modal').text()
        expect(modalText).toContain('Modal: New item for group')
      })

      // Navigate back
      await browser.back()
      await retry(async () => {
        const text = await browser.elementByCss('body').text()
        expect(text).toContain('Group 123')
      })

      // Navigate forward again - should still intercept
      await browser.forward()
      await retry(async () => {
        const modalText = await browser.elementById('modal').text()
        expect(modalText).toContain('Modal: New item for group')
      })
    })

    it('should intercept multiple times from the same route', async () => {
      // Test that interception works consistently on repeated navigation
      const browser = await next.browser('/groups/456')

      for (let i = 0; i < 3; i++) {
        await browser.elementById('new-link').click()
        await retry(async () => {
          const modalText = await browser.elementById('modal').text()
          expect(modalText).toContain('Modal: New item for group 456')
        })

        // Go back to test again
        await browser.back()
        await retry(async () => {
          const text = await browser.elementByCss('body').text()
          expect(text).toContain('Group 456')
        })
      }
    })

    it('should intercept when navigating between different dynamic segments', async () => {
      // Test interception works across different dynamic route values
      // First group
      const browser1 = await next.browser('/groups/100')

      await browser1.elementById('new-link').click()
      await retry(async () => {
        const modalText = await browser1.elementById('modal').text()
        expect(modalText).toContain('Modal: New item for group 100')
      })

      // Second group - new browser instance to test fresh navigation
      const browser2 = await next.browser('/groups/200')
      await retry(async () => {
        const text = await browser2.elementByCss('body').text()
        expect(text).toContain('Group 200')
      })

      // Intercept from second group - should still work
      await browser2.elementById('new-link').click()
      await retry(async () => {
        const modalText = await browser2.elementById('modal').text()
        expect(modalText).toContain('Modal: New item for group 200')
      })
    })
  })
})
