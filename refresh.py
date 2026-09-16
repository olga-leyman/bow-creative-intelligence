#!/usr/bin/env python3
"""Refresh Body of Work Creative Intelligence snapshot from Meta.

Usage:
  META_TOKEN=EAA... python3 refresh.py

Does not write the token anywhere. Rewrites data/snapshot.json daily rows,
unique-reach windows, and keeps existing creative metadata/thumbs.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
SNAP = ROOT / "data" / "snapshot.json"
BASE = "https://graph.facebook.com/v21.0"
ACT = "act_571042022572798"
MIN_DATE = "2026-08-17"
TZ = ZoneInfo("America/Chicago")

INSIGHT_FIELDS = (
    "ad_id,ad_name,campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,"
    "actions,action_values,unique_actions,"
    "video_play_actions,video_p25_watched_actions,video_p50_watched_actions,"
    "video_p75_watched_actions,video_p100_watched_actions,video_thruplay_watched_actions,"
    "estimated_ad_recallers,estimated_ad_recall_rate"
)
ACCOUNT_FIELDS = (
    "spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,"
    "video_play_actions,video_p25_watched_actions,video_p50_watched_actions,"
    "video_p75_watched_actions,video_p100_watched_actions,video_thruplay_watched_actions,"
    "estimated_ad_recallers,estimated_ad_recall_rate"
)


def get(path, params, token):
    params = dict(params)
    params["access_token"] = token
    url = f"{BASE}/{path}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=90) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:800]
        raise RuntimeError(f"{path} {body}") from e


def get_all(path, params, token):
    data = []
    res = get(path, params, token)
    data.extend(res.get("data", []))
    while res.get("paging", {}).get("next"):
        with urllib.request.urlopen(res["paging"]["next"], timeout=90) as r:
            res = json.loads(r.read().decode())
        data.extend(res.get("data", []))
        time.sleep(0.08)
    return data


def act(obj, *keys):
    for a in obj.get("actions") or []:
        if a.get("action_type") in keys:
            return float(a.get("value") or 0)
    return 0.0


def aval(obj, *keys):
    for a in obj.get("action_values") or []:
        if a.get("action_type") in keys:
            return float(a.get("value") or 0)
    return 0.0


def vact(obj, field):
    arr = obj.get(field) or []
    if not arr:
        return 0
    return int(float(arr[0].get("value") or 0))


def pack(row, extra=None):
    imps = int(float(row.get("impressions") or 0))
    clicks = int(float(row.get("clicks") or 0))
    spend = round(float(row.get("spend") or 0), 2)
    link = int(act(row, "link_click"))
    out = {
        "date": row.get("date_start"),
        "spend": spend,
        "imps": imps,
        "clicks": clicks,
        "reach": int(float(row.get("reach") or 0)),
        "ctr": round(float(row.get("ctr") or 0), 4),
        "cpc": round(float(row.get("cpc") or 0), 4),
        "cpm": round(float(row.get("cpm") or 0), 4),
        "purch": int(act(row, "omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase")),
        "rev": round(aval(row, "omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"), 2),
        "lpv": int(act(row, "omni_landing_page_view", "landing_page_view")),
        "atc": int(act(row, "omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart")),
        "ic": int(act(row, "omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout")),
        "link": link,
        "linkCtr": round((100 * link / imps) if imps else 0, 4),
        "react": int(act(row, "post_reaction")),
        "comment": int(act(row, "comment")),
        "save": int(act(row, "onsite_conversion.post_save", "post_save")),
        "share": int(act(row, "post", "onsite_conversion.post_share")),
        "eng": int(act(row, "post_engagement", "page_engagement")),
        "plays": vact(row, "video_play_actions") or int(act(row, "video_view")),
        "p25": vact(row, "video_p25_watched_actions"),
        "p50": vact(row, "video_p50_watched_actions"),
        "p75": vact(row, "video_p75_watched_actions"),
        "p100": vact(row, "video_p100_watched_actions"),
        "thru": vact(row, "video_thruplay_watched_actions"),
        "igProfile": int(act(
            row,
            "instagram_profile_visit",
            "instagram_profile_visits",
            "onsite_conversion.ig_profile_visit",
            "onsite_conversion.total_ig_profile_visit",
            "profile_visit",
        )),
        "igFollow": int(act(
            row,
            "follow",
            "follows",
            "instagram_follow",
            "instagram_follows",
            "onsite_conversion.follow",
        )),
        "recallers": int(float(row.get("estimated_ad_recallers") or 0)),
        "recallRate": float(row["estimated_ad_recall_rate"]) if row.get("estimated_ad_recall_rate") not in (None, "") else None,
    }
    if extra:
        out.update(extra)
    return out


def place_name(pub, pos):
    pub = (pub or "").lower()
    pos = (pos or "").lower()
    if pub == "instagram":
        if "reel" in pos:
            return "IG Reels"
        if "stor" in pos:
            return "IG Stories"
        if "feed" in pos or pos in ("", "instagram_feed"):
            return "IG Feed"
        return f"instagram {pos}".strip()
    if pub == "facebook":
        if "reel" in pos:
            return "FB Reels"
        if "stor" in pos:
            return "FB Stories"
        if pos in ("feed", "facebook_feed", ""):
            return "FB Feed"
        if "marketplace" in pos:
            return "facebook marketplace"
        if "instream" in pos:
            return "facebook instream_video"
        if "right" in pos:
            return "facebook right_hand_column"
        if "search" in pos:
            return "facebook search"
        return f"facebook {pos}".strip()
    if pub in ("audience_network", "audience-network"):
        if "reward" in pos:
            return "AN Rewarded"
        return "AN Classic"
    return f"{pub} {pos}".strip() or "unknown unknown"


def classify_ad(name, campaign):
    blob = f"{name} {campaign}"
    headline = "Built for women in their 20s and 30s—finally."
    if "UGC Cold" in blob:
        parts = [p.strip() for p in (name or "").split("|")]
        variant = parts[2] if len(parts) > 2 else "UGC"
        slug = variant.lower().replace(" ", "")
        return {
            "concept": "UGC Cold",
            "variant": variant,
            "format": "Stories-Reels",
            "lane": "UGC Cold",
            "isVideo": True,
            "headline": headline,
            "thumb": f"data/creatives/ugc-{slug}.jpg" if slug in {"julia1","julia2","frankie1","frankie2","heiley1","heiley2","keena"} else "",
        }
    if "UGC RTG" in blob or "UGC Retargeting" in blob:
        parts = [p.strip() for p in (name or "").split("|")]
        variant = parts[2] if len(parts) > 2 else "UGC"
        slug = variant.lower().replace(" ", "")
        return {
            "concept": "UGC Retargeting",
            "variant": variant,
            "format": "Stories-Reels",
            "lane": "UGC Retargeting",
            "isVideo": True,
            "headline": headline,
            "thumb": f"data/creatives/ugc-{slug}.jpg" if slug in {"julia1","julia2","frankie1","frankie2","heiley1","heiley2","keena"} else "",
        }
    return {
        "concept": "Unmapped",
        "variant": "",
        "format": "Unknown",
        "lane": "Unknown",
        "isVideo": False,
        "headline": "",
        "thumb": "",
    }


def window_pack(row):
    return {
        "spend": round(float(row.get("spend") or 0), 2),
        "reach": int(float(row.get("reach") or 0)),
        "imps": int(float(row.get("impressions") or 0)),
        "clicks": int(float(row.get("clicks") or 0)),
        "lpv": int(act(row, "omni_landing_page_view", "landing_page_view")),
        "atc": int(act(row, "omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart")),
        "purch": int(act(row, "omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase")),
        "igProfile": int(act(row, "instagram_profile_visit", "instagram_profile_visits", "onsite_conversion.ig_profile_visit", "profile_visit")),
        "igFollow": int(act(row, "follow", "follows", "instagram_follow", "instagram_follows")),
        "recallers": int(float(row.get("estimated_ad_recallers") or 0)),
        "recallRate": float(row["estimated_ad_recall_rate"]) if row.get("estimated_ad_recall_rate") not in (None, "") else None,
        "start": row.get("date_start"),
        "stop": row.get("date_stop"),
    }


def main():
    token = os.environ.get("META_TOKEN") or os.environ.get("META_ACCESS_TOKEN")
    if not token:
        sys.exit("Set META_TOKEN to a Meta user token with ads_read.")
    today = datetime.now(TZ).date().isoformat()
    tr = json.dumps({"since": MIN_DATE, "until": today})
    print(f"Refreshing {MIN_DATE} → {today}")

    me = get("me", {"fields": "id,name"}, token)
    print("connected as", me.get("name"))

    snap = json.loads(SNAP.read_text())

    print("account daily…")
    account_rows = get_all(
        f"{ACT}/insights",
        {"fields": ACCOUNT_FIELDS, "time_range": tr, "time_increment": 1, "level": "account", "limit": 500},
        token,
    )
    snap["accountDaily"] = [pack(r) for r in account_rows]
    print(" ", len(snap["accountDaily"]), "days")

    print("age daily…")
    age_rows = get_all(
        f"{ACT}/insights",
        {
            "fields": ACCOUNT_FIELDS,
            "time_range": tr,
            "time_increment": 1,
            "level": "account",
            "breakdowns": "age,gender",
            "limit": 500,
        },
        token,
    )
    snap["ageDaily"] = [pack(r, {"age": r.get("age"), "gender": r.get("gender")}) for r in age_rows]
    print(" ", len(snap["ageDaily"]), "rows")

    print("placement daily…")
    place_rows = get_all(
        f"{ACT}/insights",
        {
            "fields": ACCOUNT_FIELDS,
            "time_range": tr,
            "time_increment": 1,
            "level": "account",
            "breakdowns": "publisher_platform,platform_position",
            "limit": 500,
        },
        token,
    )
    snap["placementDaily"] = [
        pack(r, {"placement": place_name(r.get("publisher_platform"), r.get("platform_position"))})
        for r in place_rows
    ]
    print(" ", len(snap["placementDaily"]), "rows")

    print("ad daily…")
    ad_rows = get_all(
        f"{ACT}/insights",
        {"fields": INSIGHT_FIELDS, "time_range": tr, "time_increment": 1, "level": "ad", "limit": 500},
        token,
    )
    by_ad = {}
    for r in ad_rows:
        aid = str(r.get("ad_id") or "")
        by_ad.setdefault(aid, []).append(pack(r))
    existing = {str(a["id"]): a for a in snap["ads"]}
    updated = 0
    for aid, daily in by_ad.items():
        daily.sort(key=lambda x: x["date"] or "")
        if aid in existing:
            existing[aid]["daily"] = daily
            if r_name := next((x.get("campaign_name") for x in ad_rows if str(x.get("ad_id")) == aid), None):
                existing[aid]["campaign"] = existing[aid].get("campaign") or r_name
            updated += 1
        else:
            sample = next(x for x in ad_rows if str(x.get("ad_id")) == aid)
            mapped = classify_ad(sample.get("ad_name") or "", sample.get("campaign_name") or "")
            snap["ads"].append({
                "id": aid,
                "name": sample.get("ad_name") or aid,
                "status": "ACTIVE",
                "created": "",
                "concept": mapped["concept"],
                "variant": mapped["variant"],
                "format": mapped["format"],
                "lane": mapped["lane"],
                "isVideo": mapped["isVideo"],
                "headline": mapped["headline"],
                "body": "",
                "thumb": mapped["thumb"],
                "campaign": sample.get("campaign_name") or "",
                "adset": "",
                "targeting": {},
                "daily": daily,
            })
            print("  new ad", sample.get("ad_name"), "→", mapped["concept"], mapped["variant"])
    print(" ", updated, "ads updated,", len(by_ad), "with delivery")

    print("unique reach windows…")
    dates = sorted({r["date"] for r in snap["accountDaily"] if r.get("date")})
    if MIN_DATE not in dates:
        dates = [MIN_DATE] + dates
    ranges = set()
    ranges.add((MIN_DATE, today))
    end = datetime.fromisoformat(today)
    for span in (0, 6, 13, 29):
        start = (end - timedelta(days=span)).date().isoformat()
        if start < MIN_DATE:
            start = MIN_DATE
        ranges.add((start, today))
    for d in dates:
        ranges.add((d, d))
    windows = {}
    for i, (a, b) in enumerate(sorted(ranges)):
        res = get(
            f"{ACT}/insights",
            {
                "fields": "spend,reach,impressions,clicks,actions,estimated_ad_recallers,estimated_ad_recall_rate",
                "time_range": json.dumps({"since": a, "until": b}),
                "level": "account",
            },
            token,
        )
        row = (res.get("data") or [{}])[0]
        windows[f"{a}_{b}"] = window_pack(row)
        if i % 10 == 0:
            print(" ", i + 1, "/", len(ranges))
        time.sleep(0.1)
    snap["windows"] = windows

    pulled = datetime.now(ZoneInfo("America/Los_Angeles")).strftime("%Y-%m-%d %H:%M PT")
    snap["meta"]["pulled"] = pulled
    snap["meta"]["maxDate"] = today
    snap["meta"]["minDate"] = MIN_DATE
    snap["meta"]["source"] = "Meta Marketing API"
    snap["meta"]["note"] = (
        "No delivery on 17 Aug. Latest day is intraday until the Chicago day closes."
        if today == datetime.now(TZ).date().isoformat()
        else f"Window {MIN_DATE} to {today}."
    )
    snap["meta"]["igNote"] = (
        "Instagram profile visits and follows are not in the Marketing API for these campaigns. "
        "Campaign totals come from the Ads Manager export (17 Aug–10 Sep). "
        "Shorter date chips apply those totals in proportion to live campaign spend in the selected window."
    )
    SNAP.write_text(json.dumps(snap, separators=(",", ":")))
    print("wrote", SNAP)
    print("account spend", round(sum(r["spend"] for r in snap["accountDaily"]), 2),
          "purch", sum(r["purch"] for r in snap["accountDaily"]),
          "windows", len(windows))


if __name__ == "__main__":
    main()
