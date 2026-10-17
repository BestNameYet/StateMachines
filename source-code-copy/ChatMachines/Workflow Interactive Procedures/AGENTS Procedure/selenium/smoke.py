import json
import subprocess
import time
import urllib.request
from pathlib import Path

import selenium
from selenium.webdriver.common.by import By

from browser import create_browser, read_screen

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "selenium" / "artifacts"


def main():
    ARTIFACTS.mkdir(exist_ok=True)
    driver = None
    with (ARTIFACTS / "server.log").open("w") as log:
        process = subprocess.Popen(
            ["node", "interface-server.js"], cwd=ROOT, stdout=log, stderr=log
        )
        try:
            deadline = time.monotonic() + 20
            while True:
                if process.poll() is not None:
                    raise RuntimeError("Interface server exited before becoming ready.")
                try:
                    with urllib.request.urlopen("http://127.0.0.1:3000", timeout=1) as response:
                        if response.status == 200:
                            break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise RuntimeError("Interface server did not become ready.")
                    time.sleep(0.2)
            driver = create_browser()
            driver.get("http://127.0.0.1:3000")
            screen = read_screen(driver)
            assert screen["render"] == 24
            assert not screen["done"]
            fields = driver.find_elements(By.CSS_SELECTOR, "[data-variable]")
            assert [field.get_attribute("name") for field in fields] == ["$procedureMode"]
            assert driver.find_element(By.ID, "submit").is_displayed()
            assert "Select the procedure mode:" in driver.find_element(By.ID, "instruction").text
            result = {
                "status": "passed",
                "seleniumVersion": selenium.__version__,
                "browser": driver.capabilities["browserName"],
                "browserVersion": driver.capabilities["browserVersion"],
                "initialRender": screen["render"],
                "inputNames": [field.get_attribute("name") for field in fields],
                "submittedValues": False,
                "screenshotsTaken": False,
            }
            (ARTIFACTS / "setup-result.json").write_text(json.dumps(result, indent=2) + "\n")
            print(json.dumps(result, indent=2))
        finally:
            if driver is not None:
                driver.quit()
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == "__main__":
    main()

