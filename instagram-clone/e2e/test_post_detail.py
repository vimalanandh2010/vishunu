"""
VELOVE E2E post-detail test (Selenium, headless Chrome/Edge).

Prereqs:
  - backend on :5000, frontend on :5173
  - user meera_sh / StrongPass1! (1 post, follows alice_test)
  - alice_test has 1 post and one seeded comment (text "Alice original comment 🎀")

Run from instagram-clone/:  python e2e/test_post_detail.py
"""
import json
import os
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

BASE = "http://localhost:5173"
USER, PASS = "meera_sh", "StrongPass1!"
ALICE_COMMENT_TEXT = "Alice original comment 🎀"
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


def wait_css(driver, selector, timeout=15):
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, selector))
    )


def js_fetch(driver, url, method="GET", body=None):
    """Run fetch() inside the page (session cookie included); returns {status, ok, body}."""
    script = """
    const url = arguments[0], method = arguments[1], body = arguments[2];
    const opts = { method, credentials: 'include', headers: {} };
    if (body !== null) { opts.headers['Content-Type'] = 'application/json'; opts.body = body; }
    fetch(url, opts)
      .then(async (r) => {
        let j = null; try { j = await r.json(); } catch (e) {}
        arguments[arguments.length - 1](JSON.stringify({ status: r.status, ok: r.ok, body: j }));
      })
      .catch((e) => arguments[arguments.length - 1](JSON.stringify({ status: 0, error: String(e) })));
    """
    return json.loads(driver.execute_async_script(script, url, method, json.dumps(body) if body is not None else None))


def js_create_post(driver, caption):
    """Create a post with a tiny inline PNG via fetch(); returns the created post JSON."""
    script = """
    const caption = arguments[0];
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz4AFEGKgAWgCAQMAF/oKdJXz3AAAAABJRU5ErkJggg==';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], 'temp.png', { type: 'image/png' });
    const fd = new FormData();
    fd.append('media', file);
    fd.append('caption', caption);
    fetch('/api/posts', { method: 'POST', credentials: 'include', body: fd })
      .then((r) => r.json())
      .then((j) => arguments[arguments.length - 1](JSON.stringify(j)))
      .catch((e) => arguments[arguments.length - 1](JSON.stringify({ error: String(e) })));
    """
    return json.loads(driver.execute_async_script(script, caption))


def like_ids(likes):
    """Like entries may be populated user docs or plain ObjectId strings."""
    return [str(x.get("_id", x) if isinstance(x, dict) else x) for x in (likes or [])]


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
    wait_css(driver, "#app")

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
    wait_css(driver, ".feed-post")
    check("login + onboarding reaches home feed", True)

    # ---- own profile -> grid tile -> post detail ----
    driver.find_element(By.ID, "home-me").click()
    wait_css(driver, ".pf-cell[data-id]")
    tile = driver.find_element(By.CSS_SELECTOR, ".pf-cell[data-id]")
    own_post_id = tile.get_attribute("data-id")
    tile.click()
    wait_css(driver, ".pd-body:not(.pd-loading)")
    own_author = driver.find_element(By.CSS_SELECTOR, ".pd-username").text
    hash_ok = f"/post/{own_post_id}" in driver.current_url
    img = driver.find_elements(By.ID, "pd-image")
    img_ok = bool(img) and driver.execute_script("return arguments[0].complete && arguments[0].naturalWidth > 0;", img[0])
    check("grid tile opens correct post (hash + author + media)", hash_ok and own_author == "@meera_sh" and img_ok,
          f"hash={hash_ok} author={own_author} media={img_ok}")
    check("timestamp shown on detail", bool(driver.find_element(By.CSS_SELECTOR, ".pd-time").text.strip()))
    driver.save_screenshot(os.path.join(SHOT_DIR, "post-detail-own.png"))

    # ---- browser back navigation ----
    driver.back()
    wait_css(driver, ".pf-cell[data-id]")
    check("browser back returns to profile", True)

    # ---- other user's post via profile grid ----
    driver.find_element(By.ID, "pf-back").click()
    wait_css(driver, ".feed-post")
    cap = WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, '.feed-caption strong[data-username="alice_test"]'))
    )
    cap.click()
    wait_css(driver, ".pf-cell[data-id]")
    alice_post_id = driver.find_element(By.CSS_SELECTOR, ".pf-cell[data-id]").get_attribute("data-id")
    driver.find_element(By.CSS_SELECTOR, ".pf-cell[data-id]").click()
    wait_css(driver, ".pd-body:not(.pd-loading)")
    check("other user's post opens from profile grid",
          driver.find_element(By.CSS_SELECTOR, ".pd-username").text == "@alice_test")
    check("non-owner sees no edit/delete buttons",
          not driver.find_elements(By.ID, "pd-edit") and not driver.find_elements(By.ID, "pd-delete"))
    check("follow button shown for non-owner author",
          bool(driver.find_elements(By.ID, "pd-follow")))
    driver.save_screenshot(os.path.join(SHOT_DIR, "post-detail-alice.png"))

    # ---- non-owner authorization (API level) ----
    r = js_fetch(driver, f"/api/posts/{alice_post_id}", "PUT", {"caption": "hacked by meera"})
    after = js_fetch(driver, f"/api/posts/{alice_post_id}")
    check("non-owner cannot edit caption (401, unchanged)",
          r["status"] == 401 and (after["body"].get("post", {}).get("caption") or "").startswith("local debug"),
          f"status={r['status']}")
    r = js_fetch(driver, f"/api/posts/{alice_post_id}", "DELETE")
    after = js_fetch(driver, f"/api/posts/{alice_post_id}")
    check("non-owner cannot delete post (401, still exists)",
          r["status"] == 401 and after["status"] == 200, f"status={r['status']}")

    # ---- likes: like / persist / duplicate guard / restore ----
    me_id = js_fetch(driver, "/api/auth/me")["body"].get("user", {}).get("_id")
    l0 = int(driver.find_element(By.ID, "pd-like-count").text)
    driver.find_element(By.ID, "pd-like").click()
    WebDriverWait(driver, 10).until(lambda d: int(d.find_element(By.ID, "pd-like-count").text) == l0 + 1)
    likes = js_fetch(driver, f"/api/posts/{alice_post_id}")["body"]["post"]["likes"]
    check("like persists (API re-read, single entry)",
          sum(1 for i in like_ids(likes) if i == me_id) == 1)
    # duplicate guard: server toggle never duplicates the same user
    js_fetch(driver, f"/api/posts/like/{alice_post_id}", "POST")  # unlike
    js_fetch(driver, f"/api/posts/like/{alice_post_id}", "POST")  # like again
    likes = js_fetch(driver, f"/api/posts/{alice_post_id}")["body"]["post"]["likes"]
    ids = like_ids(likes)
    check("duplicate likes prevented (one entry per user)", len(ids) == len(set(ids)) and ids.count(me_id) == 1)
    driver.find_element(By.ID, "pd-like").click()  # unlike via UI
    WebDriverWait(driver, 10).until(lambda d: int(d.find_element(By.ID, "pd-like-count").text) == l0)
    check("unlike restores count", True)

    # ---- comments: add with XSS payload ----
    payload = "Selenium <script>alert(1)</script> comment ✅"
    driver.find_element(By.ID, "pd-comment-input").send_keys(payload)
    driver.find_element(By.ID, "pd-comment-submit").click()
    wait_text(driver, "#toasts", "Comment added")
    row = wait_css(driver, ".pd-comment")
    rows = driver.find_elements(By.CSS_SELECTOR, ".pd-comment")
    mine = [r for r in rows if payload[:20] in r.text]
    check("comment added with escaped text (no script executed)",
          bool(mine) and not mine[0].find_elements(By.TAG_NAME, "script")
          and "Selenium <script>alert(1)</script> comment ✅" in mine[0].text,
          f"{len(mine)} matching row(s)")
    c_data = js_fetch(driver, f"/api/comments/{alice_post_id}")
    my_comment = [c for c in c_data["body"].get("comments", []) if c["text"] == payload]
    check("comment persists (API re-read)", len(my_comment) == 1)
    driver.save_screenshot(os.path.join(SHOT_DIR, "post-detail-comments.png"))

    # ---- comment deletion: own comment ----
    del_btn = mine[0].find_element(By.CSS_SELECTOR, ".pd-c-del")
    del_btn.click()
    wait_text(driver, "#toasts", "Comment deleted")
    WebDriverWait(driver, 10).until(
        lambda d: not [r for r in d.find_elements(By.CSS_SELECTOR, ".pd-comment") if payload[:20] in r.text]
    )
    c_data = js_fetch(driver, f"/api/comments/{alice_post_id}")
    check("own comment delete works (UI + API)",
          not [c for c in c_data["body"].get("comments", []) if c["text"] == payload])

    # ---- comment deletion: unauthorized ----
    alice_rows = [r for r in driver.find_elements(By.CSS_SELECTOR, ".pd-comment") if ALICE_COMMENT_TEXT in r.text]
    no_del_btn = bool(alice_rows) and not alice_rows[0].find_elements(By.CSS_SELECTOR, ".pd-c-del")
    check("no delete button on another user's comment", no_del_btn)
    alice_comment_id = alice_rows[0].get_attribute("data-id")
    r = js_fetch(driver, f"/api/comments/{alice_comment_id}", "DELETE")
    c_data = js_fetch(driver, f"/api/comments/{alice_post_id}")
    check("API rejects deleting another user's comment (intact)",
          r["status"] in (401, 403) and any(c["_id"] == alice_comment_id for c in c_data["body"].get("comments", [])),
          f"status={r['status']}")

    # ---- owner: edit caption (via deep link reload) ----
    stamp = int(time.time() * 1000)
    driver.get(f"{BASE}/?r={stamp}#/post/{own_post_id}")
    wait_css(driver, ".pd-body:not(.pd-loading)")
    check("deep link opens post after reload",
          driver.find_element(By.CSS_SELECTOR, ".pd-username").text == "@meera_sh")
    check("owner sees edit + delete buttons",
          bool(driver.find_elements(By.ID, "pd-edit")) and bool(driver.find_elements(By.ID, "pd-delete")))
    new_caption = "First post from VELOVE 🚀 #hello (edited)"
    driver.find_element(By.ID, "pd-edit").click()
    box = wait_css(driver, "#pd-caption-input")
    box.clear()
    box.send_keys(new_caption)
    driver.find_element(By.ID, "pd-save").click()
    wait_text(driver, "#toasts", "Caption updated")
    WebDriverWait(driver, 10).until(
        lambda d: new_caption in d.find_element(By.ID, "pd-caption").text
    )
    check("owner edits caption (UI + toast)", True)
    after = js_fetch(driver, f"/api/posts/{own_post_id}")
    check("caption persists (API re-read)", after["body"]["post"]["caption"] == new_caption)

    # ---- owner: delete throwaway post with confirmation ----
    created = js_create_post(driver, "Temp post for delete test")
    temp_id = created.get("post", {}).get("_id")
    check("throwaway post created for delete test", bool(temp_id))
    driver.get(f"{BASE}/?r={stamp + 1}#/post/{temp_id}")
    wait_css(driver, ".pd-body:not(.pd-loading)")
    driver.find_element(By.ID, "pd-delete").click()
    wait_css(driver, "#pd-modal")
    check("delete confirmation dialog shown", True)
    driver.find_element(By.ID, "pd-modal-cancel").click()
    modal_gone = not driver.find_elements(By.ID, "pd-modal")
    still_on_post = bool(driver.find_elements(By.ID, "pd-delete"))
    check("cancel keeps the post", modal_gone and still_on_post)
    driver.find_element(By.ID, "pd-delete").click()
    wait_css(driver, "#pd-modal")
    driver.find_element(By.ID, "pd-modal-confirm").click()
    wait_text(driver, "#toasts", "Post deleted")
    wait_css(driver, ".profile-card")
    check("delete confirmed navigates to profile", True)
    after = js_fetch(driver, f"/api/posts/{temp_id}")
    check("deleted post gone (API 404)", after["status"] == 404, f"status={after['status']}")

    # ---- deleted post guard ----
    driver.get(f"{BASE}/?r={stamp + 2}#/post/{temp_id}")
    wait_css(driver, ".pd-error")
    check("deleted post shows error state, no broken page",
          "no longer available" in driver.find_element(By.CSS_SELECTOR, ".pd-error").text)
    driver.save_screenshot(os.path.join(SHOT_DIR, "post-detail-deleted.png"))
finally:
    driver.quit()

fails = [r for r in results if r[1] == "FAIL"]
print(f"\n{len(results) - len(fails)}/{len(results)} checks passed")
sys.exit(1 if fails else 0)
