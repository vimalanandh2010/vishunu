"""
VELOVE E2E profile-page test (Selenium, headless Chrome/Edge).

Prereqs:
  - backend running on :5000, frontend on :5173
  - test user meera_sh / StrongPass1! exists (follows alice_test, owns 1 post)

Run from instagram-clone/:  python e2e/test_profile.py
"""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

BASE = "http://localhost:5173"
USER, PASS = "meera_sh", "StrongPass1!"
SHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
results = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    results.append((name, status))
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))


def wait_text(driver, selector, text, timeout=15):
    return WebDriverWait(driver, timeout).until(
        EC.text_to_be_present_in_element((By.CSS_SELECTOR, selector), text)
    )


def make_driver():
    try:
        opts = ChromeOptions()
        opts.add_argument("--headless=new")
        opts.add_argument("--window-size=1280,900")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        return webdriver.Chrome(options=opts)
    except Exception as e:
        print(f"chrome unavailable ({e.__class__.__name__}), falling back to Edge")
        from selenium.webdriver.edge.options import Options as EdgeOptions

        eopts = EdgeOptions()
        eopts.add_argument("--headless=new")
        eopts.add_argument("--window-size=1280,900")
        return webdriver.Edge(options=eopts)


driver = make_driver()
try:
    os.makedirs(SHOT_DIR, exist_ok=True)
    driver.get(BASE)
    WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.ID, "app")))

    # ---- login + onboarding -> home ----
    WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, '.tab[data-mode="login"]'))
    ).click()
    WebDriverWait(driver, 5).until(EC.presence_of_element_located((By.ID, "li-id"))).send_keys(USER)
    driver.find_element(By.ID, "li-password").send_keys(PASS)
    driver.find_element(By.CSS_SELECTOR, '#login-form button[type="submit"]').click()

    wait_text(driver, ".onb-title", "Complete Your Profile")
    driver.find_element(By.ID, "ob-continue").click()
    wait_text(driver, ".onb-title", "Find People to Follow")
    driver.find_element(By.ID, "ob-continue").click()
    wait_text(driver, ".onb-title", "You're All Set")
    driver.find_element(By.ID, "ob-continue").click()
    WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.ID, "home-me")))
    WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.CSS_SELECTOR, ".feed-post")))
    check("login + onboarding reaches home feed", True)

    # ---- A: own profile via header avatar ----
    driver.find_element(By.ID, "home-me").click()
    WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.CSS_SELECTOR, ".profile-card .pf-head")))
    uname = driver.find_element(By.CSS_SELECTOR, ".profile-card .pf-username").text
    check("own profile opens via avatar", uname == "@meera_sh", uname)
    name = driver.find_element(By.CSS_SELECTOR, ".profile-card .pf-name").text.strip()
    check("full name shown", "Meera Sharma" in name, name)
    stats = (
        driver.find_element(By.ID, "pf-posts").text,
        driver.find_element(By.ID, "pf-followers").text,
        driver.find_element(By.ID, "pf-following").text,
    )
    check("stats posts/followers/following", stats == ("1", "0", "1"), "/".join(stats))
    check("Edit Profile button on own profile", len(driver.find_elements(By.ID, "pf-edit")) == 1)
    cells = driver.find_elements(By.CSS_SELECTOR, ".pf-grid .pf-cell img")
    img_ok = bool(cells) and driver.execute_script(
        "return arguments[0].complete && arguments[0].naturalWidth > 0;", cells[0]
    )
    check("post grid shows a loaded image", img_ok, f"{len(cells)} cell(s)")
    driver.save_screenshot(os.path.join(SHOT_DIR, "own-profile.png"))

    # ---- back to home ----
    driver.find_element(By.ID, "pf-back").click()
    WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.CSS_SELECTOR, ".feed-post")))

    # ---- B: other user's profile via feed caption ----
    cap = '.feed-caption strong[data-username="alice_test"]'
    WebDriverWait(driver, 15).until(EC.element_to_be_clickable((By.CSS_SELECTOR, cap))).click()
    WebDriverWait(driver, 15).until(
        lambda d: d.find_element(By.CSS_SELECTOR, ".profile-card .pf-username").text == "@alice_test"
    )
    check("other user's profile opens via feed caption", True)
    btn = WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.ID, "pf-follow")))
    before = driver.find_element(By.ID, "pf-followers").text
    check("shows existing follow state", btn.text.strip().startswith("Following"), btn.text.strip())
    check("followers count before toggle", before == "2", before)
    driver.save_screenshot(os.path.join(SHOT_DIR, "alice-profile.png"))

    # ---- C: unfollow, then re-follow ----
    btn.click()
    WebDriverWait(driver, 15).until(lambda d: d.find_element(By.ID, "pf-follow").text.strip() == "Follow")
    mid = driver.find_element(By.ID, "pf-followers").text
    check("unfollow flips button + count", mid == "1", f"followers={mid}")
    driver.find_element(By.ID, "pf-follow").click()
    WebDriverWait(driver, 15).until(
        lambda d: d.find_element(By.ID, "pf-follow").text.strip().startswith("Following")
    )
    after = driver.find_element(By.ID, "pf-followers").text
    check("re-follow flips button + count", after == "2", f"followers={after}")

    # ---- back nav sanity ----
    driver.find_element(By.ID, "pf-back").click()
    WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.ID, "home-me")))
    check("back to home works", True)
finally:
    driver.quit()

fails = [r for r in results if r[1] == "FAIL"]
print(f"\n{len(results) - len(fails)}/{len(results)} checks passed")
sys.exit(1 if fails else 0)
