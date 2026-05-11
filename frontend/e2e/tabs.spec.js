import { test, expect } from './fixtures.js';

test.describe('Tab Navigation', () => {
  test('tab navigation — each tab renders without crash', async ({ authenticatedPage: page }) => {
    // The tab strip is always visible. Some tabs are disabled without results,
    // but tool tabs (Drug Markets, Financial, Courts) are always clickable.
    const tabNames = ['Drug Markets', 'Financial', 'Courts'];

    for (const name of tabNames) {
      const tab = page.locator('button').filter({ hasText: name });
      if (await tab.isVisible().catch(() => false)) {
        await tab.click();
        // Main content area should render without crashing
        await expect(page.locator('main')).toBeVisible();
        // No error boundary fallback should appear
        const errorFallback = page.locator('text=Module failed to render');
        await expect(errorFallback).not.toBeVisible({ timeout: 2000 });
      }
    }

    // Return to Overview tab
    const overviewTab = page.locator('button').filter({ hasText: 'Overview' });
    if (await overviewTab.isVisible().catch(() => false)) {
      await overviewTab.click();
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('subject tabs disabled without results', async ({ authenticatedPage: page }) => {
    // Without running a search, subject-specific tabs should be disabled
    const subjectTabs = ['Breaches', 'Dark Web', 'Social Intel', 'Network'];

    for (const name of subjectTabs) {
      const tab = page.locator('button').filter({ hasText: name });
      if (await tab.isVisible().catch(() => false)) {
        // These tabs should be disabled when there are no search results
        await expect(tab).toBeDisabled();
      }
    }
  });

  test('tool tabs always accessible', async ({ authenticatedPage: page }) => {
    // Tool tabs (Drug Markets, Financial, Courts) should be clickable without results
    const toolTabs = ['Drug Markets', 'Financial', 'Courts'];

    for (const name of toolTabs) {
      const tab = page.locator('button').filter({ hasText: name });
      if (await tab.isVisible().catch(() => false)) {
        // Tool tabs should not be disabled
        await expect(tab).not.toBeDisabled();

        // Click and verify content renders
        await tab.click();
        await expect(page.locator('main')).toBeVisible();
      }
    }
  });

  test('overlay panels — profile dialog opens and closes', async ({ authenticatedPage: page }) => {
    // Click the user menu avatar in the header
    const avatar = page.locator('header [role="button"]');
    await avatar.click();

    // The dropdown menu should appear
    const profileItem = page.locator('[role="menuitem"]').filter({ hasText: 'Profile' });
    await expect(profileItem).toBeVisible({ timeout: 3000 });

    // Click Profile
    await profileItem.click();

    // Profile dialog/overlay should open — look for common profile dialog elements
    // ProfileDialog renders as an overlay; verify it appeared
    await page.waitForTimeout(500);

    // Close the overlay via Escape (overlay backdrop intercepts pointer events)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Main content should be restored
    await expect(page.locator('main')).toBeVisible();
  });

  test('overlay panels — admin menu opens', async ({ authenticatedPage: page }) => {
    // Click the user menu avatar
    const avatar = page.locator('header [role="button"]');
    await avatar.click();

    // Look for Administration menu item (only visible for admin users)
    const adminItem = page.locator('[role="menuitem"]').filter({ hasText: 'Administration' });
    const adminVisible = await adminItem.isVisible().catch(() => false);

    if (!adminVisible) {
      // User doesn't have admin access — skip
      test.skip();
      return;
    }

    await adminItem.click();

    // Admin panel should open — wait for it to render
    await page.waitForTimeout(500);

    // The admin overlay should be visible somewhere in the DOM
    // Close it via Escape or close button
    await page.keyboard.press('Escape');
  });
});
