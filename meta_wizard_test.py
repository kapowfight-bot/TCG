#!/usr/bin/env python3
"""
Focused test for Meta Wizard endpoint with Playwright implementation
"""
import requests
import json
import sys
from datetime import datetime

def test_meta_wizard_detailed():
    """Test Meta Wizard endpoint with detailed analysis"""
    base_url = "https://handtester.preview.emergentagent.com"
    api_url = f"{base_url}/api"
    
    print("🔍 Testing Meta Wizard Endpoint with Playwright Implementation")
    print("=" * 60)
    
    test_cases = [
        ("Gardevoir", "Popular deck that should exist in meta"),
        ("Charizard", "Another popular deck"),
        ("Charizard ex", "Deck with 'ex' suffix"),
        ("Raging Bolt", "Current meta deck"),
        ("NonExistentDeck123", "Non-existent deck for error handling")
    ]
    
    results = []
    
    for deck_name, description in test_cases:
        print(f"\n🧪 Testing: {deck_name} ({description})")
        print("-" * 40)
        
        try:
            # Make request with longer timeout for Playwright
            response = requests.get(f"{api_url}/meta-wizard/{deck_name}", timeout=30)
            
            print(f"Status Code: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"Response Data:")
                print(json.dumps(data, indent=2))
                
                # Analyze response structure
                required_fields = ['deck_name', 'best_matchups', 'worst_matchups', 'source', 'total_matchups']
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    print(f"❌ Missing fields: {missing_fields}")
                    results.append({"deck": deck_name, "status": "FAILED", "reason": f"Missing fields: {missing_fields}"})
                else:
                    print("✅ All required fields present")
                    
                    # Check if we got real data or fallback
                    best_matchups = data.get('best_matchups', [])
                    worst_matchups = data.get('worst_matchups', [])
                    total_matchups = data.get('total_matchups', 0)
                    
                    has_real_data = (
                        total_matchups > 0 and
                        len(best_matchups) > 0 and
                        len(worst_matchups) > 0 and
                        not any('not found' in str(matchup).lower() for matchup in best_matchups + worst_matchups)
                    )
                    
                    if has_real_data:
                        print("🎉 SUCCESS: Got real matchup data!")
                        # Validate matchup data structure
                        valid_matchups = True
                        for matchup in best_matchups + worst_matchups:
                            if not isinstance(matchup, dict) or 'opponent' not in matchup or 'win_rate' not in matchup:
                                valid_matchups = False
                                break
                            if not isinstance(matchup['win_rate'], (int, float)) or not (0 <= matchup['win_rate'] <= 100):
                                valid_matchups = False
                                break
                        
                        if valid_matchups:
                            results.append({"deck": deck_name, "status": "SUCCESS", "reason": "Real matchup data retrieved"})
                        else:
                            results.append({"deck": deck_name, "status": "FAILED", "reason": "Invalid matchup data structure"})
                    else:
                        print("⚠️  Got fallback response (no real matchup data)")
                        if deck_name == "NonExistentDeck123":
                            results.append({"deck": deck_name, "status": "SUCCESS", "reason": "Correct fallback for non-existent deck"})
                        else:
                            results.append({"deck": deck_name, "status": "FAILED", "reason": "Should have real data but got fallback"})
                            
            elif response.status_code == 500:
                print(f"❌ Server Error: {response.text}")
                results.append({"deck": deck_name, "status": "FAILED", "reason": f"Server error: {response.status_code}"})
            else:
                print(f"❌ Unexpected status code: {response.status_code}")
                results.append({"deck": deck_name, "status": "FAILED", "reason": f"Status code: {response.status_code}"})
                
        except requests.exceptions.Timeout:
            print("❌ Request timed out (>30s)")
            results.append({"deck": deck_name, "status": "FAILED", "reason": "Timeout"})
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            results.append({"deck": deck_name, "status": "FAILED", "reason": str(e)})
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    
    success_count = sum(1 for r in results if r["status"] == "SUCCESS")
    total_count = len(results)
    
    for result in results:
        status_icon = "✅" if result["status"] == "SUCCESS" else "❌"
        print(f"{status_icon} {result['deck']}: {result['reason']}")
    
    print(f"\nOverall: {success_count}/{total_count} tests passed")
    
    # Check if Playwright is working at all
    if all(r["status"] == "FAILED" and "Server error" in r["reason"] for r in results):
        print("\n🚨 CRITICAL: All requests failed with server errors - Playwright may not be working")
        return False
    elif all(r["status"] == "FAILED" and "fallback" in r["reason"].lower() for r in results if r["deck"] != "NonExistentDeck123"):
        print("\n⚠️  ISSUE: Playwright is working but not capturing matchup data - scraping logic needs adjustment")
        return False
    else:
        print("\n✅ Meta Wizard endpoint is functional")
        return True

if __name__ == "__main__":
    success = test_meta_wizard_detailed()
    sys.exit(0 if success else 1)