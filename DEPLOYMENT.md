# Deployment Instructions

## Playwright Browser Installation

This application uses Playwright for web scraping (Meta Wizard and Meta Brake features). Playwright requires browser binaries to be installed.

### Automatic Installation

The backend (`server.py`) now includes automatic browser installation on startup. If Playwright browsers are not detected, they will be installed automatically.

### Manual Installation (if needed)

If automatic installation fails, you can manually install browsers:

```bash
# In the backend directory
cd /app/backend
playwright install chromium
```

### Post-Deploy Script

A `postdeploy.sh` script is included at the project root that can be configured to run after deployment:

```bash
#!/bin/bash
playwright install chromium
```

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
