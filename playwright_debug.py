#!/usr/bin/env python3
import asyncio
from playwright.async_api import async_playwright

async def test_playwright():
    try:
        async with async_playwright() as p:
            print("Playwright context created successfully")
            browser = await p.chromium.launch(headless=True)
            print("Browser launched successfully")
            page = await browser.new_page()
            print("Page created successfully")
            await page.goto("https://www.google.com")
            print("Navigation successful")
            title = await page.title()
            print(f"Page title: {title}")
            await browser.close()
            print("Browser closed successfully")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_playwright())