#!/usr/bin/env python3
"""
eLab Room Availability Scraper

Playwright-based scraper for NYU Leslie eLab OnceHub booking calendar.
Collects available time slots and persists them to a Convex table.

Deploy:  modal deploy elab_scrape/scrape.py
Run:     modal run elab_scrape/scrape.py
"""
from __future__ import annotations

import json
import os
from datetime import date, timedelta

import httpx
import modal
from playwright.async_api import (
    Page,
    TimeoutError as PwTimeout,
    async_playwright,
)


# ── Modal App + Image ────────────────────────────────────────────────────────

app = modal.App("elab-scraper")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        # Chromium system dependencies
        "libnss3", "libnspr4", "libatk1.0-0", "libatk-bridge2.0-0",
        "libcups2", "libdrm2", "libxkbcommon0", "libxcomposite1",
        "libxdamage1", "libxfixes3", "libxrandr2", "libgbm1",
        "libpango-1.0-0", "libcairo2", "libasound2", "libatspi2.0-0",
    )
    .pip_install("playwright>=1.58.0", "httpx>=0.27")
    .run_commands("playwright install chromium")
)


# ── Constants ─────────────────────────────────────────────────────────────────

ONCEHUB_URL      = "https://go.oncehub.com/NYULeslie"
DURATION_MINUTES = 90       # default slot duration (30, 45, 60, 75, 90, 105, 120)
LOOKAHEAD_DAYS   = 30       # scrape the next N calendar days

DURATION_INDEX = {30: 0, 45: 1, 60: 2, 75: 3, 90: 4, 105: 5, 120: 6}

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

ROOM_NAMES = [
    "Pre-money conference room (fits 12 people)",
    "Lean/Launchpad (fits 30 - 50 people)",
]


# ── Calendar Helpers ──────────────────────────────────────────────────────────

def _month_number(name: str) -> int:
    return MONTH_NAMES.index(name) + 1


async def _wait_for_calendar(page: Page, timeout: int = 15_000):
    """Wait until the calendar grid has fully rendered with day buttons."""
    await page.wait_for_selector("#monthHeading", state="visible", timeout=timeout)
    await page.wait_for_selector(
        "#CalTable button.day", state="attached", timeout=timeout
    )
    # AngularJS needs ~2s after initial render to apply boldDay classes
    # and assign dateCell_N ids to available day buttons. Poll until ready.
    for _ in range(10):
        await page.wait_for_timeout(500)
        count = await page.evaluate(
            "document.querySelectorAll('button[id^=\"dateCell_\"]').length"
        )
        if count > 0:
            await page.wait_for_timeout(300)
            return
    # No dateCell buttons after 5s — month may have no availability (that's OK).


async def _dismiss_timezone_dialog(page: Page):
    """If the timezone dialog pops up, accept the defaults and continue."""
    try:
        btn = await page.wait_for_selector("#tzConfirmBtn", state="visible", timeout=8_000)
        await btn.click()
        await page.wait_for_timeout(500)
        print("    [OK] Timezone dialog dismissed")
    except PwTimeout:
        print("    [--] No timezone dialog")


async def _select_duration(page: Page, minutes: int = 90):
    """Handle the 'Select a duration' dialog that appears after timezone."""
    try:
        await page.wait_for_selector("#durationConfirmBtn", state="visible", timeout=8_000)
    except PwTimeout:
        print("    [--] No duration dialog")
        return

    idx = DURATION_INDEX.get(minutes, 2)

    dropdown = await page.wait_for_selector(
        "input#input_meeting_duration", state="visible", timeout=5_000
    )
    await dropdown.click()
    await page.wait_for_timeout(300)

    option_sel = f"#li_meeting_duration_{idx}"
    await page.wait_for_selector(option_sel, state="visible", timeout=3_000)
    await page.click(option_sel)
    await page.wait_for_timeout(300)

    await page.click("#durationConfirmBtn")
    print(f"    [OK] Duration set to {minutes} minutes")

    # CRITICAL: wait for the calendar to fully render after duration selection
    await _wait_for_calendar(page)


async def _get_month_year(page: Page) -> tuple[str, int]:
    """Return (month_name, year) from the calendar header."""
    el = await page.wait_for_selector("#monthHeading", state="visible", timeout=5_000)
    header = (await el.inner_text()).strip()   # e.g. "March 2026"
    parts = header.split()
    return parts[0], int(parts[1])


async def _navigate_to_month(page: Page, target_month: int, target_year: int):
    """Click Next/Prev arrows until the calendar shows the target month."""
    for _ in range(24):
        month_name, year = await _get_month_year(page)
        cur_month = _month_number(month_name)
        if cur_month == target_month and year == target_year:
            return
        if (year, cur_month) < (target_year, target_month):
            await page.click("#NextPeriod")
        else:
            await page.click("#PrevPeriod")
        await _wait_for_calendar(page)


async def _scrape_current_month(page: Page, target_dates: set[date]) -> list[dict]:
    """
    For the currently displayed calendar month, click each available day
    that is in target_dates and collect every time-slot button.
    """
    slots: list[dict] = []
    month_name, year = await _get_month_year(page)
    month_num = _month_number(month_name)

    day_buttons = await page.query_selector_all("button.boldDay[id^='dateCell_']")
    if not day_buttons:
        day_buttons = await page.query_selector_all("button[id^='dateCell_']")

    print(f"    Found {len(day_buttons)} available day(s) in {month_name} {year}")

    for btn in day_buttons:
        hint = (await btn.get_attribute("aria-label")) or ""
        if "Show available time slots" not in hint:
            continue

        day_text = (await btn.inner_text()).strip()
        try:
            day_num = int(day_text)
        except ValueError:
            continue

        d = date(year, month_num, day_num)
        if d not in target_dates:
            continue

        await btn.click()

        try:
            await page.wait_for_selector(
                "button[id^='timeSlot_']", state="visible", timeout=5_000
            )
        except PwTimeout:
            print(f"      {d.isoformat()} – no time slots appeared after click")
            continue

        await page.wait_for_timeout(500)

        time_buttons = await page.query_selector_all(
            "button[id^='timeSlot_']:not([id$='mobile'])"
        )
        day_slots = []
        for tb in time_buttons:
            t_text = (await tb.inner_text()).strip()
            if t_text:
                day_slots.append({
                    "date": d.isoformat(),
                    "day_of_week": d.strftime("%A"),
                    "time_slot": t_text,
                    "available": True,
                })
        slots.extend(day_slots)
        print(f"      {d.isoformat()} ({d.strftime('%A'):9s}) → {len(day_slots)} slot(s): "
              f"{', '.join(s['time_slot'] for s in day_slots)}")

    return slots


# ── Core Scraper ──────────────────────────────────────────────────────────────

async def scrape_oncehub(
    room_index: int = 0,
    duration: int = DURATION_MINUTES,
    lookahead: int = LOOKAHEAD_DAYS,
) -> list[dict]:
    """
    Scrape available booking slots for a single room.

    Parameters
    ----------
    room_index : int
        0 = Pre-money conference room, 1 = Lean/Launchpad
    duration : int
        Desired slot duration in minutes (30, 45, 60, 75, 90, 105, 120).
    lookahead : int
        Number of days into the future to scrape.

    Returns
    -------
    list[dict]
        Each dict: {room, date, day_of_week, time_slot, available}
    """
    room_name = ROOM_NAMES[room_index]
    today = date.today()
    end_date = today + timedelta(days=lookahead)

    target_dates: set[date] = set()
    d = today
    while d <= end_date:
        target_dates.add(d)
        d += timedelta(days=1)

    months_needed: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()
    d = today
    while d <= end_date:
        key = (d.year, d.month)
        if key not in seen:
            seen.add(key)
            months_needed.append(key)
        d += timedelta(days=1)

    all_slots: list[dict] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
        )
        page = await context.new_page()

        print(f"  Navigating to {ONCEHUB_URL} ...")
        await page.goto(ONCEHUB_URL, wait_until="networkidle", timeout=30_000)
        await page.wait_for_timeout(2_000)

        # Select the room card
        print(f"  Selecting room: {room_name}")
        room_keyword = room_name.split("(")[0].strip()
        links = await page.query_selector_all("a")
        clicked = False
        for link in links:
            text = (await link.inner_text()) or ""
            if room_keyword.lower() in text.lower():
                await link.click()
                clicked = True
                break
        if not clicked:
            print(f"  [ERROR] Could not find room card for '{room_keyword}'")
            await browser.close()
            return []

        await page.wait_for_timeout(3_000)

        await _dismiss_timezone_dialog(page)
        await _select_duration(page, duration)

        try:
            await page.wait_for_selector("#monthHeading", state="visible", timeout=10_000)
        except PwTimeout:
            print("  [ERROR] Calendar did not render (no #monthHeading found)")
            await browser.close()
            return []

        for year, month in months_needed:
            print(f"  Processing {MONTH_NAMES[month-1]} {year} ...")
            await _navigate_to_month(page, month, year)
            month_slots = await _scrape_current_month(page, target_dates)
            for s in month_slots:
                s["room"] = room_name
            all_slots.extend(month_slots)

        await browser.close()

    return all_slots


# ── Convex Persistence ────────────────────────────────────────────────────────

async def _convex_call(kind: str, path: str, args: dict) -> dict:
    """Call a Convex mutation or query via the HTTP API."""
    url = os.environ["CONVEX_URL"].rstrip("/")
    key = os.environ["CONVEX_DEPLOY_KEY"]
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{url}/api/{kind}",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Convex {key}",
            },
            json={"path": path, "args": args, "format": "json"},
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") == "error":
            raise RuntimeError(data.get("errorMessage"))
        return data.get("value")


async def _store_in_convex(room: str, duration: int, slots: list[dict]) -> None:
    """Persist scraped slots to the room_availability Convex table."""
    await _convex_call("mutation", "roomAvailability:upsertAvailability", {
        "room": room,
        "duration_minutes": duration,
        "slots": [
            {
                "date": s["date"],
                "day_of_week": s["day_of_week"],
                "time_slot": s["time_slot"],
                "available": s["available"],
            }
            for s in slots
        ],
    })
    print(f"  [Convex] Stored {len(slots)} slot(s) for {room}")


# ── Modal Functions ───────────────────────────────────────────────────────────

@app.function(
    image=image,
    secrets=[modal.Secret.from_name("doppler-v1")],
    timeout=600,
)
async def scrape_rooms(
    room_index: int = 0,
    duration: int = DURATION_MINUTES,
    lookahead: int = LOOKAHEAD_DAYS,
) -> list[dict]:
    """Scrape a single room and persist results to Convex."""
    slots = await scrape_oncehub(room_index, duration, lookahead)
    await _store_in_convex(ROOM_NAMES[room_index], duration, slots)
    return slots


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("doppler-v1")],
    timeout=600,
)
@modal.fastapi_endpoint(method="POST")
async def refresh_room_availability() -> dict:
    """Trigger a fresh scrape for all rooms, persist to Convex, return results."""
    all_slots: list[dict] = []
    for room_idx in range(len(ROOM_NAMES)):
        print(f"\n{'='*60}")
        print(f"Scraping room {room_idx}: {ROOM_NAMES[room_idx]}")
        print(f"{'='*60}")
        slots = await scrape_oncehub(room_index=room_idx)
        await _store_in_convex(ROOM_NAMES[room_idx], DURATION_MINUTES, slots)
        all_slots.extend(slots)
    return {"status": "ok", "total_slots": len(all_slots), "slots": all_slots}


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("doppler-v1")],
    timeout=30,
)
@modal.fastapi_endpoint(method="GET")
async def get_room_availability(room: str = "", from_date: str = "", to_date: str = "") -> dict:
    """Read cached availability from Convex (no scraping)."""
    args: dict = {}
    if room:
        args["room"] = room
    if from_date:
        args["from_date"] = from_date
    if to_date:
        args["to_date"] = to_date
    rows = await _convex_call("query", "roomAvailability:getAvailability", args)
    latest = await _convex_call("query", "roomAvailability:getLatestScrapeTime", {})
    return {"slots": rows or [], "last_scraped_at": latest}


# ── Booking Form Field Reference ─────────────────────────────────────────────
#
# After selecting a time slot and clicking "Continue", the booking form
# ("Provide information" page) contains these fields:
#
# REQUIRED FIELDS (* = required):
#   1. Subject*                    (input#1_val_system, type=text)
#      Hint: "What is the meeting about?"
#   2. Your first name*            (input#2_val_system, type=text)
#   3. Your last name*             (input#60168_val, type=text)
#   4. Your NYU email*             (input#3_val_system, type=email)
#      Hint: "The scheduling confirmation will be sent to this email"
#   5. NetID*                      (input#15400_val, type=text)
#      Hint: "Please use your NYU NetID (e.g., dmf229), not your N number"
#   6. NYU Affiliation*            (combobox#input_10636_val)
#      Options: Undergrad, Masters/MD/JD, PhD Student/Candidate,
#               Post-doc Fellow/Researcher, Alumni, Faculty,
#               Staff/Administrator, Non-NYU
#   7. NYU School*                 (combobox#input_10637_val)
#      Options: Abu Dhabi, CAS, Courant, Dentistry, Gallatin, GSAS/FAS,
#               Langone/Grossman, Law, Liberal Studies, Meyers,
#               Public Health, Shanghai, Silver, SPS, Steinhardt,
#               Stern, Tandon, Tisch, Wagner, Non-NYU, Other (at NYU)
#   8. Name of Event*              (input#10734_val, type=text)
#   9. Name of Organization*       (input#10735_val, type=text)
#  10. Number of Attendees*        (input#10737_val, type=text)
#      Hint: "only current NYU can be in the Leslie eLab"
#
# OPTIONAL FIELDS:
#  11. Expected Year of Graduation (input#57698_val, type=text)
#      Hint: "For students only."
#
# SUBMIT: button "Done" (hint: "Confirm your booking request")
# ──────────────────────────────────────────────────────────────────────────────


# ── Local Entrypoint ──────────────────────────────────────────────────────────

@app.local_entrypoint()
async def main():
    """CLI entrypoint: `modal run elab_scrape/scrape.py`"""
    all_results: list[dict] = []

    for room_idx in range(len(ROOM_NAMES)):
        print(f"\n{'='*90}")
        print(f"Scraping room {room_idx}: {ROOM_NAMES[room_idx]}")
        print(f"{'='*90}")
        slots = scrape_rooms.remote(room_index=room_idx, duration=90, lookahead=30)
        all_results.extend(slots)
        print(f"  => Found {len(slots)} time-slot entries for this room\n")

    out_path = "oncehub_slots.json"
    with open(out_path, "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\nTotal slots scraped: {len(all_results)}")
    print(f"Results saved to {out_path}")

    if all_results:
        print(f"\n{'─'*70}")
        print(f"  {'Room':38s} {'Date':12s} {'Day':10s} {'Time'}")
        print(f"{'─'*70}")
        for s in all_results:
            print(f"  {s['room'][:38]:38s} {s['date']:12s} {s['day_of_week']:10s} {s['time_slot']}")
        print(f"{'─'*70}")
    else:
        print("\nNo available slots found in the next 30 days.")
