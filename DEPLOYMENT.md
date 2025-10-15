# Deployment Instructions

## ⚠️ CRITICAL: Playwright Browser Installation Required

This application uses Playwright for web scraping (Meta Wizard and Meta Brake features). **Playwright browsers MUST be installed in production** or these features will fail.

### 🚨 Important Notes

- Playwright Python package is installed via `requirements.txt`
- **Browser binaries are NOT installed automatically** during deployment
- You MUST manually install browsers after deploying to production

### Installation Methods

#### Method 1: Run Post-Deploy Script (Recommended)

A `postdeploy.sh` script is included at the project root:

```bash
bash /app/postdeploy.sh
```

**To configure in Emergent:**
1. After deploying, access your production environment shell/terminal
2. Run: `cd /app && bash postdeploy.sh`
3. Restart backend service

#### Method 2: Manual Installation

SSH or access production environment terminal:

```bash
cd /app/backend
playwright install chromium
```

Then restart the backend service.

### Emergent Platform Configuration

To configure Emergent to run the post-deploy script:

1. **Option 1: Startup Command**
   - Configure your deployment to run `/app/postdeploy.sh` after deployment

2. **Option 2: Docker Configuration**
   - If using custom Docker builds, add to Dockerfile:
   ```dockerfile
   RUN playwright install chromium
   ```

3. **Option 3: Contact Support**
   - Ask Emergent support about configuring post-deployment hooks

### Troubleshooting

If you see errors like:
```
BrowserType.launch: Executable doesn't exist at /usr/local/share/playwright/chromium...
```

This means Playwright browsers are not installed. Solutions:
1. Restart the backend service (automatic installation will trigger)
2. Run `playwright install chromium` manually
3. Check logs for installation errors

### Dependencies

Ensure these are in `requirements.txt`:
- `playwright==1.55.0`
- `greenlet==3.2.4`
- `pyee==13.0.0`
