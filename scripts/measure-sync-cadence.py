#!/usr/bin/env python3
"""Gap-distribution stats for scheduled sync runs. Reads one ISO-8601
timestamp per line from stdin; see measure-sync-cadence.sh for usage."""
import sys
from datetime import datetime


def parse(ts):
    return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ")


def percentile(sorted_vals, pct):
    if not sorted_vals:
        return float("nan")
    k = (len(sorted_vals) - 1) * pct / 100
    f, c = int(k), min(int(k) + 1, len(sorted_vals) - 1)
    return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)


def report(label, gaps_minutes):
    if len(gaps_minutes) < 2:
        print(f"{label}: not enough runs yet ({len(gaps_minutes)})")
        return
    s = sorted(gaps_minutes)
    over_4h = sum(1 for g in s if g > 240) / len(s) * 100
    print(
        f"{label}: n={len(s)} median={percentile(s, 50):.0f}min "
        f"mean={sum(s)/len(s):.0f}min p90={percentile(s, 90):.0f}min "
        f"p99={percentile(s, 99):.0f}min pct>4h={over_4h:.1f}%"
    )


def main():
    cutover = parse(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else None
    timestamps = sorted(parse(line.strip()) for line in sys.stdin if line.strip())
    if len(timestamps) < 2:
        print(f"not enough runs to compute gaps (n={len(timestamps)})")
        return

    gaps = [
        (b - a).total_seconds() / 60
        for a, b in zip(timestamps, timestamps[1:])
    ]
    print(f"range: {timestamps[0].isoformat()}Z .. {timestamps[-1].isoformat()}Z")
    report("overall", gaps)

    if cutover is None:
        return

    before = [g for g, t in zip(gaps, timestamps[1:]) if t < cutover]
    after = [g for g, t in zip(gaps, timestamps[1:]) if t >= cutover]
    report(f"before {cutover.isoformat()}Z", before)
    report(f"after  {cutover.isoformat()}Z", after)


if __name__ == "__main__":
    main()
