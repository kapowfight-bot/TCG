#!/usr/bin/env python3

import httpx
import re
from bs4 import BeautifulSoup

async def debug_trainerhill_scraping():
    """Debug the TrainerHill scraping to see what's actually on the page"""
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            response = await http_client.get("https://www.trainerhill.com/meta?game=PTCG")
            response.raise_for_status()
            
            html = response.text
            
        soup = BeautifulSoup(html, 'html.parser')
        
        print("=== DEBUGGING TRAINERHILL SCRAPING ===")
        print(f"Response status: {response.status_code}")
        print(f"HTML length: {len(html)} characters")
        
        # Find all tables
        tables = soup.find_all('table')
        print(f"Found {len(tables)} tables")
        
        for i, table in enumerate(tables):
            print(f"\n--- TABLE {i+1} ---")
            rows = table.find_all('tr')
            print(f"Rows in table: {len(rows)}")
            
            if len(rows) >= 2:
                # Check header row
                header_row = rows[0]
                header_cells = header_row.find_all(['th', 'td'])
                print(f"Header cells: {len(header_cells)}")
                
                # Print first few header cells
                for j, cell in enumerate(header_cells[:5]):
                    text = cell.get_text(strip=True)
                    print(f"  Header {j}: '{text}'")
                
                # Check first few data rows
                for j, row in enumerate(rows[1:6]):  # First 5 data rows
                    cells = row.find_all(['td', 'th'])
                    if len(cells) >= 1:
                        first_cell = cells[0].get_text(strip=True)
                        print(f"  Row {j+1} first cell: '{first_cell}'")
        
        # Look for any text that might be deck names
        print("\n=== SEARCHING FOR POTENTIAL DECK NAMES ===")
        
        # Common Pokemon deck names to search for
        search_terms = ['charizard', 'gardevoir', 'pikachu', 'mewtwo', 'raging bolt', 'miraidon', 'chien-pao']
        
        for term in search_terms:
            if term.lower() in html.lower():
                print(f"Found '{term}' in HTML")
                # Find context around the term
                pattern = re.compile(f'.{{0,50}}{re.escape(term)}.{{0,50}}', re.IGNORECASE)
                matches = pattern.findall(html)
                for match in matches[:3]:  # Show first 3 matches
                    clean_match = re.sub(r'\s+', ' ', match).strip()
                    print(f"  Context: '{clean_match}'")
            else:
                print(f"'{term}' NOT found in HTML")
        
        # Look for percentage patterns that might indicate win rates
        print("\n=== SEARCHING FOR WIN RATE PATTERNS ===")
        percentage_pattern = r'\d+(?:\.\d+)?%'
        percentages = re.findall(percentage_pattern, html)
        print(f"Found {len(percentages)} percentage values")
        if percentages:
            print(f"Sample percentages: {percentages[:10]}")
        
    except Exception as e:
        print(f"Error during scraping debug: {str(e)}")

if __name__ == "__main__":
    import asyncio
    asyncio.run(debug_trainerhill_scraping())