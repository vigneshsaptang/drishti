import { test as base, expect } from '@playwright/test';

// Credentials — use env vars in CI, defaults for local dev
const USERNAME = process.env.E2E_USERNAME || 'operator';
const PASSWORD = process.env.E2E_PASSWORD || '';

export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/');

    // Wait for AuthGate to settle — either login form or main app
    // If setup wizard shows, we can't proceed (needs manual setup first)
    const loginForm = page.locator('form').filter({ has: page.locator('#sap-user') });
    const commandBar = page.locator('input[placeholder*="Search"]');

    // Wait for one of: login form, command bar (already authed), or setup wizard
    await Promise.race([
      loginForm.waitFor({ timeout: 10000 }).catch(() => {}),
      commandBar.waitFor({ timeout: 10000 }).catch(() => {}),
    ]);

    // If login form is visible, fill and submit
    if (await loginForm.isVisible().catch(() => false)) {
      await page.fill('#sap-user', USERNAME);
      await page.fill('#sap-pass', PASSWORD);

      // Handle CAPTCHA if present — fill a placeholder answer
      // (in dev environments, captcha is typically disabled or trivial)
      const captchaInput = page.locator('input[placeholder="Enter answer"]');
      if (await captchaInput.isVisible().catch(() => false)) {
        // Captcha is present — tests assume dev env has it disabled or solvable
        await captchaInput.fill('test');
      }

      await page.click('button[type="submit"]');

      // Wait for auth to complete — command bar appears on success
      await page.waitForSelector('input[placeholder*="Search"]', { timeout: 10000 });
    }

    await use(page);
  },
});

export { expect };
