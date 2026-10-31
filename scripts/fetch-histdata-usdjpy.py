"""Fetch free USDJPY M1 CSV zips from histdata.com and convert them into the
MT5-style CSV format BarReplay's importer accepts.

Link chain (discovered):
  /download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/usdjpy
    -> /.../usdjpy/<year>                (year page hosts hidden form#file_down)
    -> POST hidden fields to /get.php    (returns the year ZIP)

IMPORTANT - timestamps: verified empirically (weekly open/close hour
distributions across DST + volatility cross-correlation vs an MT5 export),
HistData ASCII stamps are **America/New_York wall clock** (EST/EDT), NOT GMT.
We convert them to true UTC before writing, because the app treats CSV
timestamps as UTC seconds. US DST 2023: 2023-03-12 07:00Z .. 2023-11-05 06:00Z.

HistData ASCII row:  "20230501 000000;O;H;L;C;V"  (semicolon-separated)
Output MT5 row:      "2023.05.01,00:00:00,O,H,L,C,V"  (true UTC)
"""

import argparse
import csv
import datetime as dt
import io
import os
import re
import sys
import urllib.request
import urllib.parse
import http.cookiejar
import zipfile

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
BASE = "https://www.histdata.com"
YEAR_URL = BASE + "/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/usdjpy/{year}"


def make_opener() -> urllib.request.OpenerDirector:
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def get(opener: urllib.request.OpenerDirector, url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": BASE + "/"})
    with opener.open(req, timeout=90) as resp:
        return resp.read().decode("utf-8", "replace")


def find_month_link(html: str, year: int, month: int) -> str:
    want = f"{year}-{month:02d}"
    for href in re.findall(r'href=["\']([^"\']+)["\']', html):
        if href.lower().endswith("/" + want) or f"/{want}" in href.lower():
            if "/usdjpy/" in href.lower():
                return href if href.startswith("http") else BASE + href
    raise RuntimeError(f"month link {want} not found on year page")


def hidden_fields(html: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for m in re.finditer(r"<input[^>]*type=[\"']hidden[\"'][^>]*>", html, re.I):
        tag = m.group(0)
        name = re.search(r"name=[\"']([^\"']+)[\"']", tag, re.I)
        value = re.search(r"value=[\"']([^\"']*)[\"']", tag, re.I)
        if name and name.group(1) not in ("cmd", "hosted_button_id"):
            fields[name.group(1)] = value.group(1) if value else ""
    return fields


def fetch_year_zip(opener: urllib.request.OpenerDirector, year: int) -> bytes:
    """Year page hosts a hidden form#file_down (action=/get.php) whose tk field
    authorises the download. GET the page, re-POST its fields to /get.php."""
    page_url = YEAR_URL.format(year=year)
    page_html = get(opener, page_url)
    if 'id="file_down"' not in page_html:
        raise RuntimeError("file_down form not found on year page")
    fields = hidden_fields(page_html)
    if "tk" not in fields:
        raise RuntimeError("tk field missing")
    action = re.search(r'id="file_down"[^>]*action=["\']([^"\']+)["\']', page_html, re.I)
    action_url = BASE + (action.group(1) if action else "/get.php")
    data = urllib.parse.urlencode(fields).encode("ascii")
    req = urllib.request.Request(
        action_url,
        data=data,
        headers={
            "User-Agent": UA,
            "Referer": page_url,
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with opener.open(req, timeout=600) as resp:
        payload = resp.read()
    if not payload[:2] == b"PK":
        raise RuntimeError(f"expected zip, got: {payload[:120]!r}")
    return payload


def nth_weekday(year: int, month: int, weekday: int, nth: int) -> dt.date:
    d = dt.date(year, month, 1)
    delta = (weekday - d.weekday()) % 7
    return d + dt.timedelta(days=delta + 7 * (nth - 1))


def us_dst_bounds_utc(year: int) -> tuple[dt.datetime, dt.datetime]:
    """US DST window in UTC: 2:00 local EST -> 07:00Z, 2:00 local EDT -> 06:00Z."""
    start = dt.datetime.combine(
        nth_weekday(year, 3, 6, 2), dt.time(7, 0), tzinfo=dt.timezone.utc
    )
    end = dt.datetime.combine(
        nth_weekday(year, 11, 6, 1), dt.time(6, 0), tzinfo=dt.timezone.utc
    )
    return start, end


def ny_to_utc(d: dt.date, hh: int, mm: int, ss: int) -> dt.datetime:
    """Interpret a New York wall-clock stamp as true UTC, handling US DST."""
    naive = dt.datetime(d.year, d.month, d.day, hh, mm, ss)
    est = naive.replace(tzinfo=dt.timezone(dt.timedelta(hours=-5)))
    dst_start, dst_end = us_dst_bounds_utc(d.year)
    offset = 4 if dst_start <= est < dst_end else 5
    local = naive.replace(tzinfo=dt.timezone(dt.timedelta(hours=-offset)))
    return local.astimezone(dt.timezone.utc)


def extract_rows(zbytes: bytes) -> list[tuple[str, str, str, str, str, str, str]]:
    zf = zipfile.ZipFile(io.BytesIO(zbytes))
    names = [n for n in zf.namelist() if n.upper().endswith(".CSV")]
    if not names:
        raise RuntimeError(f"no CSV inside zip: {zf.namelist()}")
    rows: list[tuple[str, str, str, str, str, str, str]] = []
    with zf.open(names[0]) as fh:
        text = io.TextIOWrapper(fh, encoding="utf-8", newline="")
        for line in csv.reader(text, delimiter=";"):
            if len(line) < 5:
                continue
            stamp = line[0].strip()
            d, t = stamp.split(" ")
            day = dt.date(int(d[0:4]), int(d[4:6]), int(d[6:8]))
            utc = ny_to_utc(day, int(t[0:2]), int(t[2:4]), int(t[4:6]))
            iso = f"{utc.year:04d}.{utc.month:02d}.{utc.day:02d}"
            hhmmss = f"{utc.hour:02d}:{utc.minute:02d}:{utc.second:02d}"
            vol = line[5].strip() if len(line) > 5 else "0"
            rows.append((iso, hhmmss, line[1], line[2], line[3], line[4], vol))
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--years", required=True, help="comma list, e.g. 2023,2024")
    ap.add_argument("--out", required=True)
    ap.add_argument("--zipdir", default=r"D:\BarReplay\test-data\_histdata-zips")
    args = ap.parse_args()

    os.makedirs(args.zipdir, exist_ok=True)
    opener = make_opener()

    all_rows: list[tuple[str, str, str, str, str, str, str]] = []
    for year in [int(y.strip()) for y in args.years.split(",") if y.strip()]:
        zip_path = os.path.join(args.zipdir, f"USDJPY_M1_{year}.zip")
        if os.path.exists(zip_path) and os.path.getsize(zip_path) > 0:
            print(f"{year}: using cached zip {zip_path}", flush=True)
            with open(zip_path, "rb") as fh:
                zbytes = fh.read()
        else:
            print(f"{year}: fetching year zip ...", flush=True)
            zbytes = fetch_year_zip(opener, year)
            with open(zip_path, "wb") as fh:
                fh.write(zbytes)
        print(f"{year}: zip {len(zbytes) / 1e6:.1f} MB, extracting ...", flush=True)
        rows = extract_rows(zbytes)
        print(
            f"{year}: {len(rows)} rows, first={rows[0][0]} {rows[0][1]}, last={rows[-1][0]} {rows[-1][1]}",
            flush=True,
        )
        all_rows.extend(rows)

    with open(args.out, "w", encoding="ascii", newline="\n") as out:
        out.write("<DATE>,<TIME>,<OPEN>,<HIGH>,<LOW>,<CLOSE>,<VOLUME>\n")
        for iso, hhmmss, o, h, l, c, vol in all_rows:
            out.write(f"{iso},{hhmmss},{o},{h},{l},{c},{vol}\n")
    print(f"DONE rows={len(all_rows)} -> {args.out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
