import os
import sys
import time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

def main():
    chrome_options = Options()
    chrome_options.add_argument("--mute-audio")
    chrome_options.add_argument("--window-size=1280,800")
    
    # Enable browser logging
    chrome_options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    
    driver = webdriver.Chrome(options=chrome_options)
    try:
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.common.by import By

        print("[Debug] Loading game...")
        driver.get("http://127.0.0.1:8000/index.html")
        
        print("[Debug] Waiting for loading screen to disappear...")
        WebDriverWait(driver, 30).until(
            EC.invisibility_of_element_located((By.ID, "loading-screen"))
        )
        
        print("[Debug] Clicking start screen to start game loop...")
        WebDriverWait(driver, 10).until(
            EC.visibility_of_element_located((By.ID, "start-screen"))
        )
        driver.execute_script("document.getElementById('start-screen').click();")
        time.sleep(1.5)
        
        print("[Debug] Entering skill lab...")
        driver.execute_script("window.game.enterSkillLab();")
        time.sleep(2)
        
        print("[Debug] Starting test for Mage...")
        driver.execute_script("""
            const classes = [
                { id: 'mage', name: '法师', tier: '基础', baseClass: 'mage', firstAdvancement: null, secondAdvancement: null }
            ];
            window.AutomatedBalanceTester.startTest({
                duration: 5000,
                level: 60,
                infiniteResource: false,
                classes: classes
            });
        """)
        
        # Poll for 6 seconds and print logs
        for _ in range(6):
            time.sleep(1)
            print("--- Browser Logs ---")
            for entry in driver.get_log('browser'):
                print(f"[{entry['level']}] {entry['message']}")
                
        # Print results
        results = driver.execute_script("return window.AutomatedBalanceTester.results;")
        print("--- Test Results ---")
        print(results)
        print("[Debug] Test finished.")
    except Exception as e:
        print(f"[Error] {e}")
    finally:
        driver.quit()

if __name__ == "__main__":
    main()
