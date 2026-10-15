import json
import os

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait


def create_browser():
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1440,1000")
    if os.environ.get("CHROME_BINARY"):
        options.binary_location = os.environ["CHROME_BINARY"]
    return webdriver.Chrome(options=options)


def read_screen(driver, timeout=20):
    return WebDriverWait(driver, timeout).until(
        lambda browser: browser.execute_script("return window.currentInstruction || null")
    )


def submit_values(driver, values, timeout=20):
    """Enter a Gemini-style JSON object using real browser form controls."""
    before = read_screen(driver)
    expected = {"$" + field["name"]: field for field in before["inputs"]}
    if set(values) != set(expected):
        raise ValueError("Returned variable names must match the current inputs.")
    for variable, value in values.items():
        field = expected[variable]
        element = driver.find_element(By.NAME, variable)
        kind = field["schema"].get("type")
        if kind == "boolean":
            if not isinstance(value, bool):
                raise ValueError(variable + " requires a Boolean.")
            Select(element).select_by_value("true" if value else "false")
        else:
            text = value if kind == "string" else json.dumps(value)
            if not isinstance(text, str):
                raise ValueError(variable + " requires a string.")
            element.clear()
            element.send_keys(text)
    driver.find_element(By.ID, "submit").click()

    def outcome(browser):
        error = browser.find_element(By.ID, "error").text.strip()
        if error:
            return {"validationError": error}
        current = browser.execute_script("return window.currentInstruction")
        if current and (current["done"] or len(current["history"]) > len(before["history"])):
            return current
        return False

    result = WebDriverWait(driver, timeout).until(outcome)
    if "validationError" in result:
        raise ValueError(result["validationError"])
    return result
