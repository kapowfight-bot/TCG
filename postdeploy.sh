#!/bin/bash
set -e

echo "=== Post-Deploy Script: Installing Playwright Browsers ==="

# Install Playwright browsers (chromium)
echo "Installing Playwright Chromium browser..."
playwright install chromium

echo "=== Playwright browsers installed successfully ==="
