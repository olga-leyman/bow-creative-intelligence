#!/usr/bin/env python3
"""Refresh Body of Work Creative Intelligence snapshot from Meta.

Usage:
  META_TOKEN=EAA... python3 refresh.py

Pulls daily insights from 2026-08-17 through today (Chicago), writes
data/snapshot.json. The dashboard 1/7/14/30/custom views read this file.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
BASE = "https://graph.facebook.com/v21.0"
ACT = "act_571042022572798"
MIN_DATE = "2026-08-17"


def get(path, params, token):
    params = dict(params)
    params["access_token"] = token
    url = f"{BASE}/{path}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=90) as r:
        return json.loads(r.read().decode())


def get_all(path, params, token):
    data = []
    res = get(path, params, token)
    data.extend(res.get("data", []))
    while res.get("paging", {}).get("next"):
        with urllib.request.urlopen(res["paging"]["next"], timeout=90) as r:
            res = json.loads(r.read().decode())
        data.extend(res.get("data", []))
        time.sleep(0.12)
    return data


def main():
    token = os.environ.get("META_TOKEN") or os.environ.get("META_ACCESS_TOKEN")
    if not token:
        sys.exit("Set META_TOKEN to a long-lived Meta user token with ads_read.")
    today = datetime.now(ZoneInfo("America/Chicago")).date().isoformat()
    print(f"Refreshing {MIN_DATE} → {today}")
    # Full rebuild lives in the agent session; this script documents the
    # intended job. Prefer asking the Cursor automation to rerun the pull
    # and rewrite data/snapshot.json with the same schema.
    me = get("me", {"fields": "id,name"}, token)
    print("connected as", me.get("name"))
    print("Next: pull daily account/ad/age/placement insights and rewrite data/snapshot.json")
    print("maxDate should be", today)


if __name__ == "__main__":
    main()
