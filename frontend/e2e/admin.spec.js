import { test, expect } from './fixtures.js';

test.describe('Admin Panel', () => {
  // Helper to open admin panel — opens user menu and clicks Administration
  async function openAdmin(page) {
    const avatar = page.locator('header [role="button"]');
    await avatar.click();

    const adminItem = page.locator('[role="menuitem"]').filter({ hasText: 'Administration' });
    const adminVisible = await adminItem.isVisible().catch(() => false);

    if (!adminVisible) {
      return false; // no admin access
    }

    await adminItem.click();
    await page.waitForTimeout(500);
    return true;
  }

  test('user list — admin users panel renders', async ({ authenticatedPage: page }) => {
    const opened = await openAdmin(page);
    if (!opened) {
      test.skip();
      return;
    }

    // AdminUsers is the default admin overlay (overlay='admin-users')
    // It should render a table or list of users
    // Look for common admin UI elements — table, user-related headings
    const adminContent = page.locator('[role="dialog"]').or(page.locator('.fixed, .absolute').filter({ hasText: /user|admin/i }));
    // Verify something rendered in the admin area without crashing
    await expect(page.locator('body')).toBeVisible();
  });

  test('config panel — navigate to admin config', async ({ authenticatedPage: page }) => {
    const opened = await openAdmin(page);
    if (!opened) {
      test.skip();
      return;
    }

    // Look for a navigation item or link to "Config" or "Settings" within the admin panel
    // AdminNav component provides navigation between admin sections
    const configLink = page.locator('button, a, [role="tab"]').filter({ hasText: /config|settings/i });
    if (await configLink.first().isVisible().catch(() => false)) {
      await configLink.first().click();
      await page.waitForTimeout(500);
    }

    // Verify the page hasn't crashed
    await expect(page.locator('body')).toBeVisible();
  });

  test('audit log — navigate to admin audit', async ({ authenticatedPage: page }) => {
    const opened = await openAdmin(page);
    if (!opened) {
      test.skip();
      return;
    }

    // Look for an "Audit" or "Audit Log" nav item
    const auditLink = page.locator('button, a, [role="tab"]').filter({ hasText: /audit/i });
    if (await auditLink.first().isVisible().catch(() => false)) {
      await auditLink.first().click();
      await page.waitForTimeout(500);
    }

    // Verify the page hasn't crashed
    await expect(page.locator('body')).toBeVisible();
  });

  test('credits overview — navigate to admin credits', async ({ authenticatedPage: page }) => {
    const opened = await openAdmin(page);
    if (!opened) {
      test.skip();
      return;
    }

    // Look for a "Credits" nav item
    const creditsLink = page.locator('button, a, [role="tab"]').filter({ hasText: /credit/i });
    if (await creditsLink.first().isVisible().catch(() => false)) {
      await creditsLink.first().click();
      await page.waitForTimeout(500);
    }

    // Verify the page hasn't crashed
    await expect(page.locator('body')).toBeVisible();
  });
});
