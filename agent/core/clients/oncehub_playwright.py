"""
Playwright-driven `SlotBackend` for the OnceHub Leslie eLab booking flow.

The DOM selectors here mirror `elab_scrape/scrape.py`, which is already
validated against the live calendar. On top of slot discovery, this module
also submits bookings using the shared club profile (see `BookingProfile`).

Playwright is imported lazily so `core.clients.oncehub` stays importable in
environments without the browser dependency (CI unit tests, Convex codegen).
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from .oncehub import (
    ALLOWED_DURATIONS,
    BookingProfile,
    BookingResult,
    ELAB_TIMEZONE,
    LEAN_LAUNCHPAD_ROOM_LABEL,
    ONCEHUB_BASE_URL,
    OnceHubSlot,
    SlotBackend,
    compute_slot_end_epoch_ms,
    map_booking_response,
    months_in_range,
    parse_time_slot,
    to_epoch_ms,
)


DURATION_INDEX = {30: 0, 45: 1, 60: 2, 75: 3, 90: 4, 105: 5, 120: 6}

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

# Booking form field ids — copied from the reference block in
# `elab_scrape/scrape.py`. If OnceHub re-renumbers these, update both files.
FIELD_SUBJECT = "#1_val_system"
FIELD_FIRST_NAME = "#2_val_system"
FIELD_LAST_NAME = "#60168_val"
FIELD_EMAIL = "#3_val_system"
FIELD_NETID = "#15400_val"
FIELD_AFFILIATION = "#input_10636_val"
FIELD_SCHOOL = "#input_10637_val"
FIELD_EVENT_NAME = "#10734_val"
FIELD_ORG_NAME = "#10735_val"
FIELD_ATTENDEES = "#10737_val"
SUBMIT_BUTTON = "button:has-text('Done')"


def _require_playwright() -> Any:
    try:
        from playwright.async_api import TimeoutError as PwTimeout, async_playwright  # noqa: F401
    except ModuleNotFoundError as exc:  # pragma: no cover - only hit in envs without playwright
        raise RuntimeError(
            "Playwright is not installed. Install it (`uv add playwright && "
            "playwright install chromium`) to use the default OnceHub backend, "
            "or inject a SlotBackend."
        ) from exc

    import playwright.async_api as pw  # type: ignore[import-not-found]
    return pw


def _month_number(name: str) -> int:
    return MONTH_NAMES.index(name) + 1


class PlaywrightSlotBackend(SlotBackend):
    """Drive go.oncehub.com/NYULeslie via a headless browser."""

    def __init__(self, *, base_url: str = ONCEHUB_BASE_URL, timezone: str = ELAB_TIMEZONE) -> None:
        self._base_url = base_url
        self._timezone = timezone

    # ── SlotBackend contract ─────────────────────────────────────────────────

    async def find_slots(
        self,
        *,
        start_date: date,
        end_date: date,
        duration_minutes: int,
        room_label: str,
    ) -> list[OnceHubSlot]:
        if duration_minutes not in ALLOWED_DURATIONS:
            raise ValueError(f"Unsupported duration {duration_minutes}")

        pw = _require_playwright()
        target_dates = _dates_between(start_date, end_date)
        months_needed = months_in_range(start_date, end_date)

        collected: list[OnceHubSlot] = []
        async with pw.async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            try:
                context = await browser.new_context(
                    viewport={"width": 1280, "height": 900},
                    user_agent=(
                        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                    ),
                )
                page = await context.new_page()
                await page.goto(self._base_url, wait_until="networkidle", timeout=30_000)
                await page.wait_for_timeout(1_500)

                await _select_room(page, room_label)
                await page.wait_for_timeout(2_500)
                await _dismiss_timezone_dialog(page, pw)
                await _select_duration(page, duration_minutes, pw)

                await page.wait_for_selector("#monthHeading", state="visible", timeout=10_000)

                for year, month in months_needed:
                    await _navigate_to_month(page, month, year, pw)
                    month_slots = await _scrape_current_month(
                        page,
                        target_dates=target_dates,
                        duration_minutes=duration_minutes,
                        room_label=room_label,
                        timezone=self._timezone,
                        pw=pw,
                    )
                    collected.extend(month_slots)
            finally:
                await browser.close()

        return collected

    async def submit_booking(
        self,
        *,
        slot_start_epoch_ms: int,
        duration_minutes: int,
        title: str,
        num_attendees: int,
        description: str | None,
        profile: BookingProfile,
        room_label: str,
    ) -> BookingResult:
        pw = _require_playwright()
        from .oncehub import from_epoch_ms  # local import to avoid top-level cycle hint

        target_dt = from_epoch_ms(slot_start_epoch_ms, tz_name=self._timezone)
        target_date = target_dt.date()
        target_time = target_dt.strftime("%I:%M %p").lstrip("0")

        async with pw.async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            try:
                context = await browser.new_context(
                    viewport={"width": 1280, "height": 900},
                    user_agent=(
                        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                    ),
                )
                page = await context.new_page()
                await page.goto(self._base_url, wait_until="networkidle", timeout=30_000)
                await page.wait_for_timeout(1_500)

                await _select_room(page, room_label)
                await page.wait_for_timeout(2_500)
                await _dismiss_timezone_dialog(page, pw)
                await _select_duration(page, duration_minutes, pw)

                await page.wait_for_selector("#monthHeading", state="visible", timeout=10_000)
                await _navigate_to_month(page, target_date.month, target_date.year, pw)
                await _click_date_and_time(
                    page, day=target_date, time_label=target_time, pw=pw
                )

                # Click the Continue button on the slot summary
                try:
                    await page.click("button:has-text('Continue')", timeout=5_000)
                except pw.TimeoutError:  # pragma: no cover - defensive
                    pass
                await page.wait_for_selector(FIELD_SUBJECT, state="visible", timeout=10_000)

                await _fill_booking_form(
                    page,
                    title=title,
                    num_attendees=num_attendees,
                    description=description,
                    profile=profile,
                )

                await page.click(SUBMIT_BUTTON)
                raw = await _scrape_confirmation(page, pw)
            finally:
                await browser.close()

        return map_booking_response(raw)


# ── Page helpers ─────────────────────────────────────────────────────────────


def _dates_between(start: date, end: date) -> set[date]:
    days: set[date] = set()
    d = start
    while d <= end:
        days.add(d)
        d += timedelta(days=1)
    return days


async def _select_room(page, room_label: str) -> None:
    keyword = room_label.split("(")[0].strip()
    links = await page.query_selector_all("a")
    for link in links:
        text = (await link.inner_text()) or ""
        if keyword.lower() in text.lower():
            await link.click()
            return
    raise RuntimeError(f"OnceHub room link not found for keyword: {keyword!r}")


async def _dismiss_timezone_dialog(page, pw) -> None:
    try:
        btn = await page.wait_for_selector("#tzConfirmBtn", state="visible", timeout=5_000)
        await btn.click()
        await page.wait_for_timeout(500)
    except pw.TimeoutError:
        return


async def _select_duration(page, minutes: int, pw) -> None:
    try:
        await page.wait_for_selector("#durationConfirmBtn", state="visible", timeout=5_000)
    except pw.TimeoutError:
        return

    idx = DURATION_INDEX.get(minutes, DURATION_INDEX[60])
    dropdown = await page.wait_for_selector(
        "input#input_meeting_duration", state="visible", timeout=5_000
    )
    await dropdown.click()
    await page.wait_for_timeout(250)

    option_sel = f"#li_meeting_duration_{idx}"
    await page.wait_for_selector(option_sel, state="visible", timeout=3_000)
    await page.click(option_sel)
    await page.wait_for_timeout(250)

    await page.click("#durationConfirmBtn")
    await _wait_for_calendar(page, pw)


async def _wait_for_calendar(page, pw) -> None:
    await page.wait_for_selector("#monthHeading", state="visible", timeout=15_000)
    await page.wait_for_selector("#CalTable button.day", state="attached", timeout=15_000)
    # AngularJS render cycle for availability styling.
    for _ in range(10):
        await page.wait_for_timeout(400)
        count = await page.evaluate(
            "document.querySelectorAll('button[id^=\"dateCell_\"]').length"
        )
        if count > 0:
            await page.wait_for_timeout(200)
            return


async def _get_month_year(page) -> tuple[str, int]:
    el = await page.wait_for_selector("#monthHeading", state="visible", timeout=5_000)
    header = (await el.inner_text()).strip()
    parts = header.split()
    return parts[0], int(parts[1])


async def _navigate_to_month(page, target_month: int, target_year: int, pw) -> None:
    for _ in range(24):
        month_name, year = await _get_month_year(page)
        cur_month = _month_number(month_name)
        if cur_month == target_month and year == target_year:
            return
        if (year, cur_month) < (target_year, target_month):
            await page.click("#NextPeriod")
        else:
            await page.click("#PrevPeriod")
        await _wait_for_calendar(page, pw)


async def _scrape_current_month(
    page,
    *,
    target_dates: set[date],
    duration_minutes: int,
    room_label: str,
    timezone: str,
    pw,
) -> list[OnceHubSlot]:
    month_name, year = await _get_month_year(page)
    month_num = _month_number(month_name)
    collected: list[OnceHubSlot] = []

    day_buttons = await page.query_selector_all("button.boldDay[id^='dateCell_']")
    if not day_buttons:
        day_buttons = await page.query_selector_all("button[id^='dateCell_']")

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
        except pw.TimeoutError:
            continue
        await page.wait_for_timeout(300)

        time_buttons = await page.query_selector_all(
            "button[id^='timeSlot_']:not([id$='mobile'])"
        )
        for tb in time_buttons:
            text = (await tb.inner_text()).strip()
            if not text:
                continue
            try:
                dt = parse_time_slot(d, text, tz_name=timezone)
            except ValueError:
                continue
            collected.append(
                OnceHubSlot(
                    date=d.isoformat(),
                    day_of_week=d.strftime("%A"),
                    time_slot=text,
                    slot_start_epoch_ms=to_epoch_ms(dt),
                    duration_minutes=duration_minutes,
                    room_label=room_label,
                )
            )
    return collected


async def _click_date_and_time(page, *, day: date, time_label: str, pw) -> None:
    day_sel = "button.boldDay[id^='dateCell_'], button[id^='dateCell_']"
    buttons = await page.query_selector_all(day_sel)
    clicked_day = False
    for btn in buttons:
        text = (await btn.inner_text()).strip()
        if text.isdigit() and int(text) == day.day:
            await btn.click()
            clicked_day = True
            break
    if not clicked_day:
        raise RuntimeError(f"Day button for {day.isoformat()} not found on OnceHub calendar")

    await page.wait_for_selector(
        "button[id^='timeSlot_']", state="visible", timeout=10_000
    )
    time_buttons = await page.query_selector_all(
        "button[id^='timeSlot_']:not([id$='mobile'])"
    )
    normalized_target = time_label.replace(" ", "").upper()
    for tb in time_buttons:
        text = (await tb.inner_text()).strip()
        if text and text.replace(" ", "").upper() == normalized_target:
            await tb.click()
            return
    raise RuntimeError(
        f"Time slot {time_label!r} not available for {day.isoformat()}"
    )


async def _fill_booking_form(
    page,
    *,
    title: str,
    num_attendees: int,
    description: str | None,
    profile: BookingProfile,
) -> None:
    subject = description.strip() if description else title
    await page.fill(FIELD_SUBJECT, subject[:200])
    await page.fill(FIELD_FIRST_NAME, profile.first_name)
    await page.fill(FIELD_LAST_NAME, profile.last_name)
    await page.fill(FIELD_EMAIL, profile.email)
    await page.fill(FIELD_NETID, profile.netid)
    await _select_combobox_option(page, FIELD_AFFILIATION, profile.affiliation)
    await _select_combobox_option(page, FIELD_SCHOOL, profile.school)
    await page.fill(FIELD_EVENT_NAME, title)
    await page.fill(FIELD_ORG_NAME, profile.organization_name)
    await page.fill(FIELD_ATTENDEES, str(num_attendees))


async def _select_combobox_option(page, locator: str, option_label: str) -> None:
    await page.click(locator)
    await page.wait_for_timeout(150)
    # OnceHub combobox options surface as `li` children with the exact label.
    option_selector = f"li:has-text('{option_label}')"
    try:
        await page.click(option_selector, timeout=2_500)
    except Exception:
        # Fall back to typing the label and hitting Enter if the option list
        # isn't a simple click-to-select list.
        await page.fill(locator, option_label)
        await page.keyboard.press("Enter")


async def _scrape_confirmation(page, pw) -> dict[str, Any]:
    try:
        await page.wait_for_selector(
            "text=Your booking has been confirmed", timeout=20_000
        )
        confirmed = True
    except pw.TimeoutError:
        confirmed = False

    reference: str | None = None
    try:
        ref_el = await page.wait_for_selector(
            "[data-testid='booking-reference'], .booking-reference",
            state="visible",
            timeout=3_000,
        )
        reference = (await ref_el.inner_text()).strip() if ref_el else None
    except Exception:
        reference = None

    raw: dict[str, Any] = {
        "status": "confirmed" if confirmed else "failed",
        "booking_reference": reference,
        "page_url": page.url,
    }
    return raw


__all__ = [
    "PlaywrightSlotBackend",
    "compute_slot_end_epoch_ms",  # re-exported for convenience
    "LEAN_LAUNCHPAD_ROOM_LABEL",
]
