import requests
import json
import sys
from datetime import datetime

class TestStatisticsAPITester:
    def __init__(self, base_url="https://handtester.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        # Valid session token from database
        self.session_token = "Ht1-FY5vGHoO8RInJTotpmwvVUD10Nf8y7GIE5PkRp0"
        self.user_id = "607618ff-65bb-49c5-aad6-e4ca48aeec68"
        self.deck_id = "79572d04-3a16-4c1a-b967-016d1d62b798"
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

    def get_auth_headers(self):
        """Get authentication headers"""
        return {
            "Authorization": f"Bearer {self.session_token}",
            "Content-Type": "application/json"
        }

    def get_auth_cookies(self):
        """Get authentication cookies"""
        return {"session_token": self.session_token}

    def test_auth_me_with_session(self):
        """Test /auth/me with valid session"""
        try:
            response = requests.get(
                f"{self.api_url}/auth/me",
                headers=self.get_auth_headers(),
                timeout=10
            )
            success = response.status_code == 200
            if success:
                data = response.json()
                success = data.get("email") == "kapowfight@gmail.com"
            self.log_test("Auth Me (Authenticated)", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Auth Me (Authenticated)", False, str(e))
            return False

    def test_get_decks_authenticated(self):
        """Test getting decks with authentication"""
        try:
            response = requests.get(
                f"{self.api_url}/decks",
                headers=self.get_auth_headers(),
                timeout=10
            )
            success = response.status_code == 200
            if success:
                data = response.json()
                success = isinstance(data, list) and len(data) > 0
                if success:
                    # Check if deck has the expected structure
                    deck = data[0]
                    required_fields = ["id", "deck_name", "deck_list", "user_id"]
                    success = all(field in deck for field in required_fields)
            self.log_test("Get Decks (Authenticated)", success, f"Status: {response.status_code}")
            return success, response.json() if success else None
        except Exception as e:
            self.log_test("Get Decks (Authenticated)", False, str(e))
            return False, None

    def test_save_test_results(self):
        """Test saving test results to deck - CRITICAL TEST"""
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
                f"{self.api_url}/decks/{self.deck_id}/test-results",
                json=test_data,
                headers=self.get_auth_headers(),
                timeout=10
            )
            
            success = response.status_code == 200
            if success:
                data = response.json()
                success = data.get("message") == "Test results saved successfully"
            
            self.log_test("Save Test Results (CRITICAL)", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Save Test Results (CRITICAL)", False, str(e))
            return False

    def test_verify_test_results_saved(self):
        """Verify test results were saved to deck"""
        try:
            response = requests.get(
                f"{self.api_url}/decks/{self.deck_id}",
                headers=self.get_auth_headers(),
                timeout=10
            )
            
            success = response.status_code == 200
            if success:
                deck = response.json()
                success = "test_results" in deck
                if success:
                    test_results = deck["test_results"]
                    expected_fields = ["total_hands", "mulligan_count", "mulligan_percentage", 
                                     "avg_pokemon", "avg_trainer", "avg_energy", "last_tested"]
                    success = all(field in test_results for field in expected_fields)
                    if success:
                        # Verify the values match what we saved
                        success = (test_results["total_hands"] == 100 and
                                 test_results["mulligan_count"] == 15 and
                                 test_results["mulligan_percentage"] == 15.0)
            
            self.log_test("Verify Test Results Saved", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Verify Test Results Saved", False, str(e))
            return False

    def test_create_matches_for_going_second_stats(self):
        """Create test matches to verify going second stats calculation"""
        try:
            # Create matches with went_first=False to test going second stats
            matches_data = [
                {
                    "deck_id": self.deck_id,
                    "result": "win",
                    "opponent_deck_name": "Mewtwo ex",
                    "went_first": False,  # Going second
                    "bad_game": False,
                    "mulligan_count": 1,
                    "notes": "Test match for going second win"
                },
                {
                    "deck_id": self.deck_id,
                    "result": "loss",
                    "opponent_deck_name": "Charizard ex",
                    "went_first": False,  # Going second
                    "bad_game": False,
                    "mulligan_count": 2,
                    "notes": "Test match for going second loss"
                },
                {
                    "deck_id": self.deck_id,
                    "result": "win",
                    "opponent_deck_name": "Pikachu ex",
                    "went_first": False,  # Going second
                    "bad_game": False,
                    "mulligan_count": 0,
                    "notes": "Another test match for going second win"
                }
            ]
            
            created_matches = 0
            for match_data in matches_data:
                response = requests.post(
                    f"{self.api_url}/matches",
                    json=match_data,
                    headers=self.get_auth_headers(),
                    timeout=10
                )
                if response.status_code == 200:
                    created_matches += 1
            
            success = created_matches == len(matches_data)
            self.log_test("Create Test Matches", success, f"Created {created_matches}/{len(matches_data)} matches")
            return success
        except Exception as e:
            self.log_test("Create Test Matches", False, str(e))
            return False

    def test_get_deck_stats_with_going_second(self):
        """Test deck stats endpoint includes going second statistics - CRITICAL TEST"""
        try:
            response = requests.get(
                f"{self.api_url}/decks/{self.deck_id}/stats",
                headers=self.get_auth_headers(),
                timeout=10
            )
            
            success = response.status_code == 200
            if success:
                stats = response.json()
                # Check that going second stats are included
                required_fields = ["went_second_wins", "went_second_losses", 
                                 "went_first_wins", "went_first_losses"]
                success = all(field in stats for field in required_fields)
                
                if success:
                    # Verify the calculations are reasonable
                    went_second_wins = stats["went_second_wins"]
                    went_second_losses = stats["went_second_losses"]
                    success = (isinstance(went_second_wins, int) and 
                             isinstance(went_second_losses, int) and
                             went_second_wins >= 0 and went_second_losses >= 0)
                    
                    print(f"  Going second wins: {went_second_wins}")
                    print(f"  Going second losses: {went_second_losses}")
            
            self.log_test("Get Deck Stats with Going Second (CRITICAL)", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Get Deck Stats with Going Second (CRITICAL)", False, str(e))
            return False

    def test_decks_list_includes_test_results(self):
        """Test that decks list includes test_results field"""
        try:
            response = requests.get(
                f"{self.api_url}/decks",
                headers=self.get_auth_headers(),
                timeout=10
            )
            
            success = response.status_code == 200
            if success:
                decks = response.json()
                success = len(decks) > 0
                if success:
                    # Find our deck and check if it has test_results
                    our_deck = next((d for d in decks if d["id"] == self.deck_id), None)
                    success = our_deck is not None and "test_results" in our_deck
            
            self.log_test("Decks List Includes Test Results", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Decks List Includes Test Results", False, str(e))
            return False

    def run_all_tests(self):
        """Run all test statistics tests"""
        print("🚀 Starting Pokemon TCG Test Statistics API Tests")
        print("=" * 60)
        
        # Test authentication first
        if not self.test_auth_me_with_session():
            print("❌ Authentication failed. Cannot proceed with authenticated tests.")
            return False
        
        # Test basic deck access
        deck_success, decks = self.test_get_decks_authenticated()
        if not deck_success:
            print("❌ Cannot access decks. Stopping tests.")
            return False
        
        # CRITICAL TEST 1: Save test results
        print("\n🎯 CRITICAL TEST: Save Test Results")
        if not self.test_save_test_results():
            print("❌ CRITICAL FAILURE: Cannot save test results")
        
        # Verify test results were saved
        self.test_verify_test_results_saved()
        
        # Create test matches for going second stats
        print("\n🎯 Setting up test data for going second stats")
        self.test_create_matches_for_going_second_stats()
        
        # CRITICAL TEST 2: Get stats with going second calculations
        print("\n🎯 CRITICAL TEST: Going Second Stats")
        if not self.test_get_deck_stats_with_going_second():
            print("❌ CRITICAL FAILURE: Going second stats not working")
        
        # Test that decks list includes test results
        self.test_decks_list_includes_test_results()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All test statistics tests passed!")
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
    tester = TestStatisticsAPITester()
    success = tester.run_all_tests()
    
    # Save test results
    summary = tester.get_test_summary()
    with open('/app/test_statistics_results.json', 'w') as f:
        json.dump(summary, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())