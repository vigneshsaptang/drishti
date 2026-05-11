# Spec 011 — Playwright E2E Tests

## Worktree: wt-infra
## Priority: P1
## Depends on: specs 007-010 (error handling complete)

## Goal

Stand up Playwright in `frontend/` and write a critical-path E2E suite that covers the flows a client will actually hit: login, search, tab switching, error states, and admin panel. This is the "can we ship?" gate — not exhaustive coverage, but enough to catch regressions in the golden path.

## Context

- **No test framework exists** in the frontend today — no playwright, vitest, jest, or cypress.
- The app is tab-based (not routed) — `App.jsx` manages `activeTab` and `overlay` state.
- Auth goes through `AuthGate.jsx`: bootstrap via `GET /api/auth/status`, login via `POST /api/auth/login`, tokens in `sessionStorage`.
- Search is SSE-based: `POST /api/v2/search` streams events. Tabs consume `useSearchV2` hook results.
- Backend runs on `:8888` in dev, frontend Vite on `:4444` with `/api` proxy.

## Owned files (create)

```
frontend/playwright.config.js
frontend/e2e/auth.spec.js
frontend/e2e/search.spec.js
frontend/e2e/tabs.spec.js
frontend/e2e/admin.spec.js
frontend/e2e/error-boundary.spec.js
frontend/e2e/fixtures.js
```

## Modified files

```
frontend/package.json          — add playwright dev dependency + test script
frontend/.gitignore            — add playwright artifacts (test-results/, playwright-report/)
```

## Read-only (do not modify)

```
frontend/src/**/*              — no production code changes
backend/**/*                   — no backend changes
```

## Implementation

### 1. Install & configure

```bash
cd frontend
npm install -D @playwright/test
npx playwright install chromium   # chromium only, keep CI fast
```

Add to `package.json` scripts:
```json
"test:e2e": "npx playwright test",
"test:e2e:ui": "npx playwright test --ui"
```

### 2. `playwright.config.js`

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:4444',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    port: 4444,
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
```

Note: `reuseExistingServer: true` so tests work whether Vite is already running or not. Backend must be running separately (Docker or `uvicorn`).

### 3. `e2e/fixtures.js` — shared auth helper

Export a custom `test` fixture that logs in before each test file that needs auth. Store session state to avoid re-login per test.

```js
import { test as base, expect } from '@playwright/test';

// Credentials — use env vars in CI, defaults for local dev
const USERNAME = process.env.E2E_USERNAME || 'operator';
const PASSWORD = process.env.E2E_PASSWORD || '';

export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/');
    // Wait for AuthGate to settle
    // If setup needed, skip (separate setup test)
    // If login form visible, fill and submit
    const loginForm = page.locator('form').filter({ hasText: /sign in|log in/i });
    if (await loginForm.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.fill('input[name="username"], input[type="text"]', USERNAME);
      await page.fill('input[type="password"]', PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForSelector('[data-testid="command-bar"], input[placeholder*="Search"]', { timeout: 10000 });
    }
    await use(page);
  },
});

export { expect };
```

### 4. Test files

#### `e2e/auth.spec.js`
- **Login success**: navigate to `/`, fill credentials, submit, assert command bar / search input visible
- **Login failure**: wrong password → assert error message displayed
- **Logout**: click profile → sign out → assert login form reappears
- **Session persistence**: login → reload page → assert still authenticated (sessionStorage tokens survive reload)
- **401 redirect**: manually clear sessionStorage → navigate to a tab → assert redirected to login

#### `e2e/search.spec.js`
- **Run a search**: type a test phone/email in command bar, submit, wait for results to stream in
- **Results appear**: assert at least one entity card rendered (or "no results" message if test data is empty)
- **Cancel search**: start a search, click cancel, assert loading stops
- **Tab shows results**: after search, click "Breaches" tab, assert breach content area is present
- **Clear search**: click clear/new search, assert results area is empty

#### `e2e/tabs.spec.js`
- **Tab navigation**: click each tab (Overview, Breaches, Darkweb, Drugs, Telegram, Financial, Graph, eCourts) → assert corresponding content container renders without crash
- **Tab persistence**: switch to Drugs tab, trigger a drug search, switch to another tab, switch back → assert drug results still visible
- **Overlay panels**: click profile icon → assert profile dialog opens. Click admin menu → assert admin panel opens. Close → assert main content restored.

#### `e2e/admin.spec.js` (requires admin role)
- **User list**: navigate to admin → users, assert user table renders
- **Config panel**: navigate to admin → config, assert config form renders
- **Audit log**: navigate to admin → audit, assert log entries or empty-state renders
- **Credits overview**: navigate to admin → credits, assert credit panel renders

#### `e2e/error-boundary.spec.js`
- **ErrorBoundary renders fallback**: inject a JS error into a tab component (via `page.evaluate` overriding a module), assert the "Module failed to render" fallback message appears
- **Retry works**: click Retry on the error fallback, assert the tab re-renders (may error again, but the retry mechanism fires)
- **Global error capture**: inject `window.dispatchEvent(new ErrorEvent('error', {...}))`, assert `/api/errors` receives a POST (intercept with `page.route`)

### 5. `.gitignore` additions

```
test-results/
playwright-report/
blob-report/
```

## Acceptance criteria

- [ ] `npm install` succeeds with playwright added to devDependencies
- [ ] `npx playwright test e2e/auth.spec.js` runs and at least the login-success test passes against a running local stack
- [ ] `npx playwright test` runs all 5 spec files without config errors
- [ ] Tests that require auth use the `authenticatedPage` fixture (no hardcoded login flows duplicated across files)
- [ ] `playwright.config.js` uses `reuseExistingServer: true` and targets `:4444`
- [ ] No production source files modified
- [ ] `npm run lint` still passes (playwright files excluded or lint-clean)
- [ ] `npm run build` still succeeds

## Testing instructions

```bash
# Terminal 1: backend
docker compose -f docker-compose.dev.yml up --build -d

# Terminal 2: frontend
cd frontend && npm run dev

# Terminal 3: run tests
cd frontend && npm run test:e2e
```

## HANDOFF items

None expected — all new files in `frontend/`.

## Summary output

Write summary to: `specs/infra/011-playwright-e2e-tests.summary.md`

## Notes

- The test suite assumes a running backend with real Mongo data. For CI, you'd mock the backend or run against a seeded test instance — that's a follow-up spec, not this one.
- Don't add data-testid attributes to production components in this spec. Use visible text, roles, and existing selectors. If a test is fragile without a testid, note it in the summary as a follow-up.
- CAPTCHA on login may block E2E. If captcha is enabled in the dev environment, tests need to either disable it (via env var / admin config) or use the captcha endpoint to solve it programmatically. Handle whichever is simpler.
