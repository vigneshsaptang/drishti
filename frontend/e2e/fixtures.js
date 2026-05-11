import { test as base, expect } from '@playwright/test';

const USERNAME = process.env.E2E_USERNAME || 'operator';
const PASSWORD = process.env.E2E_PASSWORD || '';

async function solveCaptcha(page) {
  const captchaImg = page.locator('img[alt="CAPTCHA"]');
  if (!(await captchaImg.isVisible().catch(() => false))) return null;

  const src = await captchaImg.getAttribute('src');
  if (!src || !src.startsWith('data:image/svg+xml;base64,')) return null;

  const svg = Buffer.from(src.split(',')[1], 'base64').toString('utf-8');
  const texts = [...svg.matchAll(/>([^<]+)<\/text>/g)].map(m => m[1].trim()).filter(Boolean);
  const expr = texts.join('').replace(/x/g, '*').replace(/×/g, '*');
  try {
    return String(eval(expr));
  } catch {
    return null;
  }
}

async function attemptLogin(page) {
  // Wait for the captcha image to render (async fetch on mount)
  const captchaImg = page.locator('img[alt="CAPTCHA"]');
  await captchaImg.waitFor({ timeout: 8000 }).catch(() => {});

  await page.fill('#sap-user', USERNAME);
  await page.fill('#sap-pass', PASSWORD);

  const captchaInput = page.locator('input[placeholder="Enter answer"]');
  if (await captchaInput.isVisible().catch(() => false)) {
    const answer = await solveCaptcha(page);
    if (answer) {
      await captchaInput.fill(answer);
    }
  }

  await page.click('button[type="submit"]');

  // Wait for either success (search bar) or failure (error message stays on login)
  const searchBar = page.locator('input[placeholder*="Search"]');
  const errorMsg = page.locator('[role="alert"]');

  await Promise.race([
    searchBar.waitFor({ timeout: 10000 }).catch(() => {}),
    errorMsg.waitFor({ timeout: 10000 }).catch(() => {}),
  ]);

  return await searchBar.isVisible().catch(() => false);
}

export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/');

    const loginForm = page.locator('form').filter({ has: page.locator('#sap-user') });
    const commandBar = page.locator('input[placeholder*="Search"]');

    await Promise.race([
      loginForm.waitFor({ timeout: 10000 }).catch(() => {}),
      commandBar.waitFor({ timeout: 10000 }).catch(() => {}),
    ]);

    if (await loginForm.isVisible().catch(() => false)) {
      if (!PASSWORD) {
        throw new Error('E2E_PASSWORD not set — cannot login. Set it via: E2E_PASSWORD=yourpass npx playwright test');
      }

      let loggedIn = await attemptLogin(page);

      // Retry once if login failed (captcha race condition under concurrent workers)
      if (!loggedIn) {
        // After a failed login, the component refetches captcha automatically
        // Wait for the new captcha to render, then retry
        const captchaImg = page.locator('img[alt="CAPTCHA"]');
        await captchaImg.waitFor({ timeout: 8000 }).catch(() => {});
        loggedIn = await attemptLogin(page);
      }

      if (!loggedIn) {
        throw new Error('Login failed after 2 attempts — check credentials and captcha endpoint');
      }
    }

    await use(page);
  },
});

export { expect, solveCaptcha };
