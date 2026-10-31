"""Fetch USDJPY 1-minute candles from Dukascopy's public data feed and write
an MT5-style CSV for BarReplay import testing.

Per-day file: https://datafeed.dukascopy.com/datafeed/USDJPY/<y>/<m-1>/<d>/BID_candles_min_1.bi5
bi5 = LZMA-compressed 24-byte records: >i f f f f f
  (seconds offset in day, open, close, low, high, volume)
"""

import argparse
import lzma
import struct
import sys
import urllib.request
from datetime import date, timedelta

SYMBOL = "USDJPY"
HDR = "<DATE>,<TIME>,<OPEN>,<HIGH>,<LOW>,<CLOSE>,<VOLUME>\n"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--symbol", default=SYMBOL)
    p.add_argument("--start", required=True, help="YYYY-MM-DD (inclusive)")
    p.add_argument("--end", required=True, help="YYYY-MM-DD (inclusive)")
    p.add_argument("--out", required=True)
    return p.parse_args()


def fetch_day(symbol: str, d: date) -> bytes:
    url = (
        f"https://datafeed.dukascopy.com/datafeed/{symbol}/"
        f"{d.year}/{d.month - 1:02d}/{d.day:02d}/BID_candles_min_1.bi5"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def decompress(raw: bytes) -> bytes:
    try:
        return lzma.decompress(raw)
    except lzma.LZMAError:
        return lzma.decompress(raw, format=lzma.FORMAT_ALONE)


def main() -> int:
    args = parse_args()
    symbol = args.symbol.replace("/", "")
    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)
    rows = 0
    days_ok = 0
    with open(args.out, "w", encoding="ascii", newline="\n") as out:
        out.write(HDR)
        d = start
        while d <= end:
            try:
                raw = fetch_day(symbol, d)
            except Exception as err:  # noqa: BLE001 - report and continue
                print(f"{d} FETCH-ERR {err}", flush=True)
                d += timedelta(days=1)
                continue
            if not raw:
                print(f"{d} EMPTY", flush=True)
                d += timedelta(days=1)
                continue
            try:
                data = decompress(raw)
            except lzma.LZMAError as err:
                print(f"{d} LZMA-ERR {err}", flush=True)
                d += timedelta(days=1)
                continue
            n = len(data) // 24
            day_rows = 0
            for i in range(n):
                secs, o, c, lo, hi, vol = struct.unpack(">iffff", data[i * 24 : (i + 1) * 24])
                if o <= 0 or hi <= 0 or lo <= 0 or c <= 0:
                    continue  # filler/empty record
                hh, mm, ss = secs // 3600, (secs % 3600) // 60, secs % 60
                out.write(
                    f"{d.year}.{d.month:02d}.{d.day:02d},"
                    f"{hh:02d}:{mm:02d}:{ss:02d},"
                    f"{o:.3f},{hi:.3f},{lo:.3f},{c:.3f},{int(round(vol))}\n"
                )
                day_rows += 1
            rows += day_rows
            days_ok += 1
            print(f"{d} ok {day_rows} bars", flush=True)
            d += timedelta(days=1)
    print(f"DONE rows={rows} days={days_ok} -> {args.out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
