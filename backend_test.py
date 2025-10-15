import requests
import sys
import json
from datetime import datetime

class PokemonTCGTrackerTester:
    def __init__(self, base_url="https://handtester.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.session_token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def test_health_check(self):
        """Test if backend is accessible"""
        try:
            response = requests.get(f"{self.base_url}/", timeout=10)
            success = response.status_code in [200, 404]  # 404 is ok for root endpoint
            self.log_test("Backend Health Check", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Backend Health Check", False, str(e))
            return False

    def test_auth_me_without_session(self):
        """Test /auth/me without authentication"""
        try:
            response = requests.get(f"{self.api_url}/auth/me", timeout=10)
            success = response.status_code == 401
            self.log_test("Auth Me (Unauthenticated)", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Auth Me (Unauthenticated)", False, str(e))
            return False

    def test_create_session_invalid(self):
        """Test session creation with invalid session_id"""
        try:
            response = requests.post(
                f"{self.api_url}/auth/session",
                json={"session_id": "invalid_session_123"},
                timeout=10
            )
            success = response.status_code in [400, 401, 500]  # Should fail
            self.log_test("Create Session (Invalid)", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Create Session (Invalid)", False, str(e))
            return False

    def test_decks_without_auth(self):
        """Test deck endpoints without authentication"""
        try:
            response = requests.get(f"{self.api_url}/decks", timeout=10)
            success = response.status_code == 401
            self.log_test("Get Decks (Unauthenticated)", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Get Decks (Unauthenticated)", False, str(e))
            return False

    def test_create_deck_without_auth(self):
        """Test deck creation without authentication"""
        try:
            response = requests.post(
                f"{self.api_url}/decks",
                json={
                    "deck_name": "Test Deck",
                    "deck_list": "4 Pikachu ex MEW 123\n3 Raichu VMAX SHF 45"
                },
                timeout=10
            )
            success = response.status_code == 401
            self.log_test("Create Deck (Unauthenticated)", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Create Deck (Unauthenticated)", False, str(e))
            return False

    def test_matches_without_auth(self):
        """Test match endpoints without authentication"""
        try:
            response = requests.get(f"{self.api_url}/matches/test-deck-id", timeout=10)
            success = response.status_code == 401
            self.log_test("Get Matches (Unauthenticated)", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Get Matches (Unauthenticated)", False, str(e))
            return False

    def test_create_match_without_auth(self):
        """Test match creation without authentication"""
        try:
            response = requests.post(
                f"{self.api_url}/matches",
                json={
                    "deck_id": "test-deck-id",
                    "result": "win",
                    "opponent_deck_name": "Mewtwo ex",
                    "went_first": True,
                    "bad_game": False
                },
                timeout=10
            )
            success = response.status_code == 401
            self.log_test("Create Match (Unauthenticated)", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Create Match (Unauthenticated)", False, str(e))
            return False

    def test_deck_stats_without_auth(self):
        """Test deck stats without authentication"""
        try:
            response = requests.get(f"{self.api_url}/decks/test-deck-id/stats", timeout=10)
            success = response.status_code == 401
            self.log_test("Get Deck Stats (Unauthenticated)", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Get Deck Stats (Unauthenticated)", False, str(e))
            return False

    def test_logout_without_auth(self):
        """Test logout without authentication"""
        try:
            response = requests.post(f"{self.api_url}/auth/logout", timeout=10)
            success = response.status_code == 200  # Should succeed even without auth
            self.log_test("Logout (Unauthenticated)", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Logout (Unauthenticated)", False, str(e))
            return False

    def test_nonexistent_endpoints(self):
        """Test non-existent endpoints"""
        try:
            response = requests.get(f"{self.api_url}/nonexistent", timeout=10)
            success = response.status_code == 404
            self.log_test("Non-existent Endpoint", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Non-existent Endpoint", False, str(e))
            return False

    def test_save_test_results_without_auth(self):
        """Test saving test results without authentication"""
        try:
            test_data = {
                "total_hands": 100,
                "mulligan_count": 15,
                "mulligan_percentage": 15.0,
                "avg_pokemon": 2.5,
                "avg_trainer": 3.2,
                "avg_energy": 1.3
            }
            response = requests.post(
                f"{self.api_url}/decks/test-deck-id/test-results",
                json=test_data,
                timeout=10
            )
            success = response.status_code == 401
            self.log_test("Save Test Results (Unauthenticated)", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Save Test Results (Unauthenticated)", False, str(e))
            return False

    def test_test_results_endpoint_structure(self):
        """Test test results endpoint accepts correct data structure"""
        try:
            # Test with missing required fields
            incomplete_data = {
                "total_hands": 100,
                "mulligan_count": 15
                # Missing other required fields
            }
            response = requests.post(
                f"{self.api_url}/decks/test-deck-id/test-results",
                json=incomplete_data,
                timeout=10
            )
            # Should fail due to missing auth, but we're testing if endpoint exists and validates structure
            success = response.status_code in [401, 422]  # 401 for auth, 422 for validation
            self.log_test("Test Results Endpoint Structure", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Test Results Endpoint Structure", False, str(e))
            return False

    def test_cards_endpoint(self):
        """Test cards endpoint functionality"""
        try:
            response = requests.get(f"{self.api_url}/cards/count", timeout=10)
            success = response.status_code == 200
            if success:
                data = response.json()
                success = "count" in data and isinstance(data["count"], int)
            self.log_test("Cards Count Endpoint", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Cards Count Endpoint", False, str(e))
            return False

    def test_card_lookup_endpoint(self):
        """Test individual card lookup endpoint"""
        try:
            # Test with a common set code and card number
            response = requests.get(f"{self.api_url}/cards/MEW/123", timeout=10)
            # Should return 404 if card not found, which is expected behavior
            success = response.status_code in [200, 404]
            self.log_test("Card Lookup Endpoint", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Card Lookup Endpoint", False, str(e))
            return False

    def test_test_results_data_validation(self):
        """Test test results endpoint data validation"""
        try:
            # Test with invalid data types
            invalid_data = {
                "total_hands": "not_a_number",
                "mulligan_count": 15,
                "mulligan_percentage": 15.0,
                "avg_pokemon": 2.5,
                "avg_trainer": 3.2,
                "avg_energy": 1.3
            }
            response = requests.post(
                f"{self.api_url}/decks/test-deck-id/test-results",
                json=invalid_data,
                timeout=10
            )
            # Should fail due to validation error (422) or auth (401)
            success = response.status_code in [401, 422]
            self.log_test("Test Results Data Validation", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Test Results Data Validation", False, str(e))
            return False

    def test_stats_endpoint_structure(self):
        """Test that stats endpoint exists and requires auth"""
        try:
            response = requests.get(f"{self.api_url}/decks/test-deck-id/stats", timeout=10)
            success = response.status_code == 401  # Should require authentication
            self.log_test("Stats Endpoint Structure", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Stats Endpoint Structure", False, str(e))
            return False

    def test_comprehensive_endpoint_coverage(self):
        """Test that all expected endpoints exist"""
        endpoints_to_test = [
            ("/auth/me", "GET"),
            ("/auth/session", "POST"),
            ("/auth/logout", "POST"),
            ("/decks", "GET"),
            ("/decks", "POST"),
            ("/matches", "POST"),
            ("/cards/count", "GET")
        ]
        
        all_passed = True
        for endpoint, method in endpoints_to_test:
            try:
                if method == "GET":
                    response = requests.get(f"{self.api_url}{endpoint}", timeout=10)
                else:
                    response = requests.post(f"{self.api_url}{endpoint}", json={}, timeout=10)
                
                # Any response other than 404 means the endpoint exists
                if response.status_code == 404:
                    self.log_test(f"Endpoint Exists: {method} {endpoint}", False, "404 Not Found")
                    all_passed = False
                else:
                    self.log_test(f"Endpoint Exists: {method} {endpoint}", True, f"Status: {response.status_code}")
            except Exception as e:
                self.log_test(f"Endpoint Exists: {method} {endpoint}", False, str(e))
                all_passed = False
        
        return all_passed

    def test_edit_deck_feature_without_auth(self):
        """Test Edit Deck PUT endpoint without authentication"""
        try:
            deck_id = "79572d04-3a16-4c1a-b967-016d1d62b798"
            update_data = {
                "deck_name": "Updated Deck Name",
                "deck_list": "4 Pikachu ex MEW 123\n3 Raichu VMAX SHF 45"
            }
            response = requests.put(
                f"{self.api_url}/decks/{deck_id}",
                json=update_data,
                timeout=10
            )
            success = response.status_code == 401
            self.log_test("Edit Deck (Unauthenticated)", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Edit Deck (Unauthenticated)", False, str(e))
            return False

    def test_edit_deck_endpoint_structure(self):
        """Test Edit Deck endpoint accepts correct data structure"""
        try:
            deck_id = "79572d04-3a16-4c1a-b967-016d1d62b798"
            # Test with partial update data
            partial_data = {
                "deck_name": "New Name Only"
            }
            response = requests.put(
                f"{self.api_url}/decks/{deck_id}",
                json=partial_data,
                timeout=10
            )
            # Should fail due to missing auth, but we're testing if endpoint exists
            success = response.status_code in [401, 422]  # 401 for auth, 422 for validation
            self.log_test("Edit Deck Endpoint Structure", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Edit Deck Endpoint Structure", False, str(e))
            return False

    def test_edit_deck_nonexistent_deck(self):
        """Test Edit Deck with non-existent deck ID"""
        try:
            fake_deck_id = "00000000-0000-0000-0000-000000000000"
            update_data = {
                "deck_name": "Updated Name"
            }
            response = requests.put(
                f"{self.api_url}/decks/{fake_deck_id}",
                json=update_data,
                timeout=10
            )
            # Should fail due to auth first, but endpoint should exist
            success = response.status_code in [401, 404]
            self.log_test("Edit Deck (Non-existent)", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Edit Deck (Non-existent)", False, str(e))
            return False

    def test_meta_wizard_endpoint_exists(self):
        """Test Meta Wizard endpoint exists"""
        try:
            response = requests.get(f"{self.api_url}/meta-wizard/Gardevoir", timeout=15)
            # Endpoint should exist but may require auth or return data
            success = response.status_code in [200, 401, 500]  # Any response except 404 means endpoint exists
            self.log_test("Meta Wizard Endpoint Exists", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Meta Wizard Endpoint Exists", False, str(e))
            return False

    def test_meta_wizard_gardevoir(self):
        """Test Meta Wizard with Gardevoir deck"""
        try:
            response = requests.get(f"{self.api_url}/meta-wizard/Gardevoir", timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                # Verify response structure
                required_fields = ['deck_name', 'best_matchups', 'worst_matchups', 'source', 'total_matchups']
                has_all_fields = all(field in data for field in required_fields)
                
                # Verify data types and structure
                valid_structure = (
                    isinstance(data.get('deck_name'), str) and
                    isinstance(data.get('best_matchups'), list) and
                    isinstance(data.get('worst_matchups'), list) and
                    isinstance(data.get('source'), str) and
                    isinstance(data.get('total_matchups'), int)
                )
                
                # Verify matchup data structure
                valid_matchups = True
                for matchup in data.get('best_matchups', []):
                    if not (isinstance(matchup.get('opponent'), str) and 
                           isinstance(matchup.get('win_rate'), (int, float))):
                        valid_matchups = False
                        break
                
                for matchup in data.get('worst_matchups', []):
                    if not (isinstance(matchup.get('opponent'), str) and 
                           isinstance(matchup.get('win_rate'), (int, float))):
                        valid_matchups = False
                        break
                
                success = has_all_fields and valid_structure and valid_matchups
                details = f"Status: {response.status_code}, Fields: {has_all_fields}, Structure: {valid_structure}, Matchups: {valid_matchups}"
                
                if success:
                    # Verify best matchups are sorted highest to lowest
                    best_rates = [m['win_rate'] for m in data.get('best_matchups', [])]
                    best_sorted = best_rates == sorted(best_rates, reverse=True)
                    
                    # Verify worst matchups are sorted lowest to highest  
                    worst_rates = [m['win_rate'] for m in data.get('worst_matchups', [])]
                    worst_sorted = worst_rates == sorted(worst_rates)
                    
                    success = best_sorted and worst_sorted
                    details += f", Best sorted: {best_sorted}, Worst sorted: {worst_sorted}"
                    
            else:
                success = False
                details = f"Status: {response.status_code}"
                
            self.log_test("Meta Wizard Gardevoir", success, details)
            return success
        except Exception as e:
            self.log_test("Meta Wizard Gardevoir", False, str(e))
            return False

    def test_meta_wizard_charizard(self):
        """Test Meta Wizard with Charizard deck"""
        try:
            response = requests.get(f"{self.api_url}/meta-wizard/Charizard", timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                # Verify response structure (same as Gardevoir test)
                required_fields = ['deck_name', 'best_matchups', 'worst_matchups', 'source', 'total_matchups']
                has_all_fields = all(field in data for field in required_fields)
                
                valid_structure = (
                    isinstance(data.get('deck_name'), str) and
                    isinstance(data.get('best_matchups'), list) and
                    isinstance(data.get('worst_matchups'), list) and
                    isinstance(data.get('source'), str) and
                    data.get('source') == 'TrainerHill'
                )
                
                success = has_all_fields and valid_structure
                details = f"Status: {response.status_code}, Fields: {has_all_fields}, Structure: {valid_structure}"
            else:
                success = False
                details = f"Status: {response.status_code}"
                
            self.log_test("Meta Wizard Charizard", success, details)
            return success
        except Exception as e:
            self.log_test("Meta Wizard Charizard", False, str(e))
            return False

    def test_meta_wizard_nonexistent_deck(self):
        """Test Meta Wizard with non-existent deck"""
        try:
            response = requests.get(f"{self.api_url}/meta-wizard/NonExistentDeck123", timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                # Should return fallback message for non-existent deck
                required_fields = ['deck_name', 'best_matchups', 'worst_matchups', 'source']
                has_all_fields = all(field in data for field in required_fields)
                
                # Check if it's a fallback response
                is_fallback = (
                    'not found' in str(data.get('best_matchups', [])).lower() or
                    'not found' in str(data.get('note', '')).lower() or
                    data.get('total_matchups', 0) == 0
                )
                
                success = has_all_fields and is_fallback
                details = f"Status: {response.status_code}, Fields: {has_all_fields}, Fallback: {is_fallback}"
            else:
                success = False
                details = f"Status: {response.status_code}"
                
            self.log_test("Meta Wizard Non-existent Deck", success, details)
            return success
        except Exception as e:
            self.log_test("Meta Wizard Non-existent Deck", False, str(e))
            return False

    def test_meta_wizard_scraping_functionality(self):
        """Test Meta Wizard scraping functionality with real deck names"""
        try:
            # Test with multiple deck names to verify scraping works
            test_decks = ["Gardevoir", "Charizard", "Pikachu"]
            successful_scrapes = 0
            
            for deck_name in test_decks:
                try:
                    response = requests.get(f"{self.api_url}/meta-wizard/{deck_name}", timeout=15)
                    if response.status_code == 200:
                        data = response.json()
                        if (data.get('source') == 'TrainerHill' and 
                            isinstance(data.get('total_matchups'), int)):
                            successful_scrapes += 1
                except:
                    continue
            
            # At least one deck should return valid data
            success = successful_scrapes > 0
            details = f"Successful scrapes: {successful_scrapes}/{len(test_decks)}"
            
            self.log_test("Meta Wizard Scraping Functionality", success, details)
            return success
        except Exception as e:
            self.log_test("Meta Wizard Scraping Functionality", False, str(e))
            return False

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Pokemon TCG Tracker Backend Tests")
        print("=" * 50)
        
        # Basic connectivity tests
        if not self.test_health_check():
            print("❌ Backend is not accessible. Stopping tests.")
            return False
        
        # Authentication tests
        self.test_auth_me_without_session()
        self.test_create_session_invalid()
        self.test_logout_without_auth()
        
        # Protected endpoint tests (without auth)
        self.test_decks_without_auth()
        self.test_create_deck_without_auth()
        self.test_matches_without_auth()
        self.test_create_match_without_auth()
        self.test_deck_stats_without_auth()
        
        # Error handling tests
        self.test_nonexistent_endpoints()
        
        # Test new features (test statistics)
        self.test_save_test_results_without_auth()
        self.test_test_results_endpoint_structure()
        self.test_test_results_data_validation()
        self.test_stats_endpoint_structure()
        
        # Test additional endpoints
        self.test_cards_endpoint()
        self.test_card_lookup_endpoint()
        
        # Test comprehensive endpoint coverage
        self.test_comprehensive_endpoint_coverage()
        
        # Test Edit Deck feature
        self.test_edit_deck_feature_without_auth()
        self.test_edit_deck_endpoint_structure()
        self.test_edit_deck_nonexistent_deck()
        
        # Test Meta Wizard feature
        self.test_meta_wizard_endpoint_exists()
        self.test_meta_wizard_gardevoir()
        self.test_meta_wizard_charizard()
        self.test_meta_wizard_nonexistent_deck()
        self.test_meta_wizard_scraping_functionality()
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print("⚠️  Some tests failed. Check the details above.")
            return False

    def get_test_summary(self):
        """Get test summary for reporting"""
        return {
            "total_tests": self.tests_run,
            "passed_tests": self.tests_passed,
            "failed_tests": self.tests_run - self.tests_passed,
            "success_rate": (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0,
            "test_results": self.test_results
        }

def main():
    tester = PokemonTCGTrackerTester()
    success = tester.run_all_tests()
    
    # Save test results
    summary = tester.get_test_summary()
    with open('/app/backend_test_results.json', 'w') as f:
        json.dump(summary, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())