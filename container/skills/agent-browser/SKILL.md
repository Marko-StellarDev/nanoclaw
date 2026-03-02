---
name: agent-browser
description: Browse the web for any task — research topics, read articles, interact with web apps, fill forms, take screenshots, extract data, and test web pages. Use whenever a browser would be useful, not just when the user explicitly asks.
allowed-tools: Bash(agent-browser:*), Bash(node:*), Bash(python3:*)
---

# Browser Automation

Three options available — choose based on complexity:

| Tool | Best for |
|------|---------|
| `agent-browser` CLI | Simple tasks: open page, click, fill, screenshot |
| Node.js + Playwright | Complex automations: loops, error handling, multi-tab, network interception |
| Python + Playwright | Data-heavy tasks: parsing, spreadsheets, pandas, combined with browser |

All three use the same system Chromium — no extra setup needed.

---

# agent-browser CLI

## Quick start

```bash
agent-browser open <url>        # Navigate to page
agent-browser snapshot -i       # Get interactive elements with refs
agent-browser click @e1         # Click element by ref
agent-browser fill @e2 "text"   # Fill input by ref
agent-browser close             # Close browser
```

## Core workflow

1. Navigate: `agent-browser open <url>`
2. Snapshot: `agent-browser snapshot -i` (returns elements with refs like `@e1`, `@e2`)
3. Interact using refs from the snapshot
4. Re-snapshot after navigation or significant DOM changes

## Commands

### Navigation

```bash
agent-browser open <url>      # Navigate to URL
agent-browser back            # Go back
agent-browser forward         # Go forward
agent-browser reload          # Reload page
agent-browser close           # Close browser
```

### Snapshot (page analysis)

```bash
agent-browser snapshot            # Full accessibility tree
agent-browser snapshot -i         # Interactive elements only (recommended)
agent-browser snapshot -c         # Compact output
agent-browser snapshot -d 3       # Limit depth to 3
agent-browser snapshot -s "#main" # Scope to CSS selector
```

### Interactions (use @refs from snapshot)

```bash
agent-browser click @e1           # Click
agent-browser dblclick @e1        # Double-click
agent-browser fill @e2 "text"     # Clear and type
agent-browser type @e2 "text"     # Type without clearing
agent-browser press Enter         # Press key
agent-browser hover @e1           # Hover
agent-browser check @e1           # Check checkbox
agent-browser uncheck @e1         # Uncheck checkbox
agent-browser select @e1 "value"  # Select dropdown option
agent-browser scroll down 500     # Scroll page
agent-browser upload @e1 file.pdf # Upload files
```

### Get information

```bash
agent-browser get text @e1        # Get element text
agent-browser get html @e1        # Get innerHTML
agent-browser get value @e1       # Get input value
agent-browser get attr @e1 href   # Get attribute
agent-browser get title           # Get page title
agent-browser get url             # Get current URL
agent-browser get count ".item"   # Count matching elements
```

### Screenshots & PDF

```bash
agent-browser screenshot          # Save to temp directory
agent-browser screenshot path.png # Save to specific path
agent-browser screenshot --full   # Full page
agent-browser pdf output.pdf      # Save as PDF
```

### Wait

```bash
agent-browser wait @e1                     # Wait for element
agent-browser wait 2000                    # Wait milliseconds
agent-browser wait --text "Success"        # Wait for text
agent-browser wait --url "**/dashboard"    # Wait for URL pattern
agent-browser wait --load networkidle      # Wait for network idle
```

### Semantic locators (alternative to refs)

```bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@test.com"
agent-browser find placeholder "Search" type "query"
```

### Authentication with saved state

```bash
# Login once
agent-browser open https://app.example.com/login
agent-browser snapshot -i
agent-browser fill @e1 "username"
agent-browser fill @e2 "password"
agent-browser click @e3
agent-browser wait --url "**/dashboard"
agent-browser state save auth.json

# Later: load saved state
agent-browser state load auth.json
agent-browser open https://app.example.com/dashboard
```

### Cookies & Storage

```bash
agent-browser cookies                     # Get all cookies
agent-browser cookies set name value      # Set cookie
agent-browser cookies clear               # Clear cookies
agent-browser storage local               # Get localStorage
agent-browser storage local set k v       # Set value
```

### JavaScript

```bash
agent-browser eval "document.title"   # Run JavaScript
```

## Example: Form submission

```bash
agent-browser open https://example.com/form
agent-browser snapshot -i
# Output shows: textbox "Email" [ref=e1], textbox "Password" [ref=e2], button "Submit" [ref=e3]

agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser snapshot -i  # Check result
```

## Example: Data extraction

```bash
agent-browser open https://example.com/products
agent-browser snapshot -i
agent-browser get text @e1  # Get product title
agent-browser get attr @e2 href  # Get link URL
agent-browser screenshot products.png
```

---

# Node.js Playwright (full scripting)

Use when a task needs loops, error handling, multi-tab, network interception, or anything too complex for CLI commands.

## Quick start

Write a script and run it with `node`:

```bash
cat > /tmp/scrape.js << 'EOF'
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  await page.goto('https://example.com');
  const title = await page.title();
  console.log('Title:', title);

  await browser.close();
})();
EOF
node /tmp/scrape.js
```

## Common patterns

### Login and save session
```javascript
const { chromium } = require('playwright');
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const context = await browser.newContext();
const page = await context.newPage();

await page.goto('https://app.example.com/login');
await page.fill('#email', 'user@example.com');
await page.fill('#password', 'secret');
await page.click('button[type=submit]');
await page.waitForURL('**/dashboard');

// Save session for reuse
await context.storageState({ path: '/workspace/group/browser-auth.json' });
await browser.close();
```

### Reuse saved session
```javascript
const context = await browser.newContext({
  storageState: '/workspace/group/browser-auth.json'
});
```

### Multi-tab workflow
```javascript
const page1 = await context.newPage();
const page2 = await context.newPage();
await page1.goto('https://site.com/list');
// extract links, open each in page2, scrape data
```

### Intercept network requests
```javascript
await page.route('**/api/**', route => {
  console.log('API call:', route.request().url());
  route.continue();
});
```

### Extract table data
```javascript
const rows = await page.$$eval('table tr', rows =>
  rows.map(r => Array.from(r.querySelectorAll('td')).map(td => td.innerText))
);
console.log(JSON.stringify(rows));
```

### Screenshot / PDF
```javascript
await page.screenshot({ path: '/workspace/group/report.png', fullPage: true });
await page.pdf({ path: '/workspace/group/report.pdf', format: 'A4' });
```

---

# Python Playwright (data-heavy tasks)

Use when you need to combine browser automation with data processing (pandas, csv, json manipulation, etc.).

## Quick start

```bash
cat > /tmp/scrape.py << 'EOF'
import os
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'],
        args=['--no-sandbox', '--disable-setuid-sandbox']
    )
    page = browser.new_page()
    page.goto('https://example.com')
    print(page.title())
    browser.close()
EOF
python3 /tmp/scrape.py
```

## Common patterns

### Extract table to CSV
```python
import csv, os
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'],
        args=['--no-sandbox', '--disable-setuid-sandbox']
    )
    page = browser.new_page()
    page.goto('https://example.com/report')

    rows = page.eval_on_selector_all('table tr', '''rows =>
        rows.map(r => [...r.querySelectorAll("td,th")].map(c => c.innerText))
    ''')

    with open('/workspace/group/report.csv', 'w', newline='') as f:
        csv.writer(f).writerows(rows)

    browser.close()
    print(f"Saved {len(rows)} rows")
```

### Login with saved session
```python
context = browser.new_context(storage_state='/workspace/group/browser-auth.json')
# or save: context.storage_state(path='/workspace/group/browser-auth.json')
```

### Async variant (for concurrent pages)
```python
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'],
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )
        page = await browser.new_page()
        await page.goto('https://example.com')
        print(await page.title())
        await browser.close()

asyncio.run(main())
```
