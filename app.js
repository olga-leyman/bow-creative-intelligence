const PAGES = [
  ["week", "01", "Last 7 days"],
  ["library", "02", "Creative testing"],
  ["video", "03", "Video retention"],
  ["google", "04", "Google Ads"],
  ["site", "05", "Website"],
  ["story", "06", "Earlier week"],
];

const PRESETS = [
  ["7d", "7 day"],
  ["14d", "14 day"],
  ["30d", "30 day"],
];

const LIB_SORTS = [
  ["ctr", "Highest CTR"],
  ["eng", "Highest engagement"],
  ["share", "Highest reshares"],
  ["react", "Highest likes"],
  ["igFollow", "Highest Instagram followers"],
];

const state = {
  page: "week",
  preset: "7d",
  from: null,
  to: null,
  selectedAd: null,
  sort: "ctr",
  libConcept: "all",
  libFormat: "all",
  testMonth: "m2",
  testWave: "all",
  videoSort: "hook",
  videoLane: "all",
  videoWave: "all",
  siteMonth: "oct",
};

let DATA = null;
let PREVIEWS = {};

const $ = (id) => document.getElementById(id);

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function clamp(iso, min, max) {
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}`;
}
function fmtRange(a, b) {
  return a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`;
}
function usd(n, d = 2) {
  return (n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
}
function num(n) { return (n || 0).toLocaleString("en-US"); }
function pct(n, d = 2) { return `${(n || 0).toFixed(d)}%`; }
function dash(v, fn) { return v == null || Number.isNaN(v) ? "—" : fn(v); }

function month1Range() {
  const min = DATA.meta.minDate;
  const max = DATA.meta.maxDate;
  const from = DATA.meta.month1From || "2026-08-17";
  const to = DATA.meta.month1To || "2026-09-17";
  return [clamp(from, min, max), clamp(to, min, max)];
}

function month1LabelRange() {
  return [DATA.meta.month1From || "2026-08-17", DATA.meta.month1To || "2026-09-17"];
}

function currentRange() {
  const min = DATA.meta.minDate;
  const max = DATA.meta.maxDate;
  if (state.preset === "m1") return month1Range();
  if (state.preset === "custom") {
    return [clamp(state.from || min, min, max), clamp(state.to || max, min, max)];
  }
  const span = { "1d": 0, "7d": 6, "14d": 13, "30d": 29 }[state.preset];
  const to = max;
  const from = clamp(addDays(to, -span), min, max);
  return [from, to];
}

function inRange(date) {
  if (!date) return false;
  const [from, to] = currentRange();
  return date >= from && date <= to;
}

function sumMetrics(rows) {
  const z = { spend:0, imps:0, clicks:0, reach:0, purch:0, rev:0, lpv:0, atc:0, ic:0, link:0, react:0, comment:0, save:0, share:0, eng:0, plays:0, p25:0, p50:0, p75:0, p100:0, thru:0, igProfile:0, igFollow:0, recallers:0 };
  for (const r of rows) {
    for (const k of Object.keys(z)) z[k] += r[k] || 0;
  }
  z.ctr = z.imps ? (100 * z.clicks) / z.imps : 0;
  z.linkCtr = z.imps ? (100 * z.link) / z.imps : 0;
  z.cpc = z.clicks ? z.spend / z.clicks : 0;
  z.cpm = z.imps ? (z.spend / z.imps) * 1000 : 0;
  z.roas = z.spend ? z.rev / z.spend : 0;
  z.cpa = z.purch ? z.spend / z.purch : null;
  z.cplpv = z.lpv ? z.spend / z.lpv : null;
  z.hook = z.imps && z.p25 ? (100 * z.p25) / z.imps : null;
  z.hold = z.plays ? (100 * z.p25) / z.plays : null;
  z.complete = z.plays ? (100 * z.p100) / z.plays : null;
  z.engRate = z.imps ? (100 * z.eng) / z.imps : 0;
  return z;
}

function rowsBetween(list) {
  return (list || []).filter((r) => inRange(r.date));
}

function adMetrics(ad) {
  return sumMetrics(rowsBetween(ad.daily));
}

function accountMetrics() {
  return sumMetrics(rowsBetween(DATA.accountDaily));
}

function campaignSpend(from, to) {
  const map = {};
  for (const ad of DATA.ads) {
    const spend = (ad.daily || [])
      .filter((r) => r.date >= from && r.date <= to)
      .reduce((s, r) => s + (r.spend || 0), 0);
    const k = ad.campaign || "";
    if (!k) continue;
    map[k] = (map[k] || 0) + spend;
  }
  return map;
}

function igMetrics() {
  const exp = DATA.igExport;
  const empty = { igProfile: 0, igFollow: 0, igEstimated: false, byCampaign: [] };
  if (!exp || !exp.campaigns) return empty;
  const [from, to] = currentRange();
  const part = campaignSpend(from, to);
  const full = campaignSpend(exp.start, exp.stop);
  const exact = from <= exp.start && to >= exp.stop;
  let visits = 0;
  let follows = 0;
  const byCampaign = exp.campaigns.map((c) => {
    const denom = full[c.name] || c.spend || 0;
    const ratio = denom > 0 ? (part[c.name] || 0) / denom : 0;
    const igProfile = exact ? c.igProfile : Math.round(c.igProfile * ratio);
    const igFollow = exact ? c.igFollow : Math.round(c.igFollow * ratio);
    visits += igProfile;
    follows += igFollow;
    return { ...c, spend: part[c.name] || 0, igProfile, igFollow, ratio };
  }).sort((a, b) => b.igProfile - a.igProfile || b.spend - a.spend);
  if (exact) {
    visits = exp.profileVisits;
    follows = exp.follows;
  }
  return { igProfile: visits, igFollow: follows, igEstimated: !exact, byCampaign };
}

function campaignShort(name) {
  if (/UGC Cold/i.test(name)) return "Month 2 · UGC Cold";
  if (/UGC Retargeting/i.test(name)) return "Month 2 · UGC Retargeting";
  if (/Concept Testing/i.test(name)) return "Prospecting · Concept Testing";
  if (/Reels Creative Test/i.test(name)) return "Reels creative test";
  if (/Add to Cart/i.test(name)) return "ATC Reels";
  if (/ThruPlay/i.test(name)) return "ThruPlay";
  if (/Priority Retargeting/i.test(name)) return "Priority retargeting";
  if (/LPV Cascade/i.test(name)) return "LPV cascade";
  if (/Isolated Test Wave 3/i.test(name)) return "Month 2 · test · 30 Sep";
  if (/Isolated Test Wave 2/i.test(name)) return "Month 2 · test · 27 Sep";
  if (/Isolated Test/i.test(name)) return "Month 2 · test · 25 Sep";
  if (/IG Profile/i.test(name)) return "Instagram profile traffic";
  if (/IG Visitors/i.test(name)) return "Instagram visitor retargeting";
  return name.replace(/^BOW \| US \| ABO \| /, "");
}

function ugcBundle(name) {
  const items = adsWithSpend().filter((x) => x.ad.concept === name);
  return { name, items, tot: sumMetrics(items.flatMap((x) => rowsBetween(x.ad.daily))) };
}

function windowMetrics() {
  const [from, to] = currentRange();
  const m = accountMetrics();
  const w = DATA.windows && DATA.windows[`${from}_${to}`];
  if (w) {
    m.reach = w.reach;
    m.recallers = w.recallers || 0;
    m.recallRate = w.recallRate;
    m.uniqueReach = true;
  } else {
    m.uniqueReach = false;
  }
  const ig = igMetrics();
  m.igProfile = ig.igProfile;
  m.igFollow = ig.igFollow;
  m.igEstimated = ig.igEstimated;
  m.igCampaigns = ig.byCampaign;
  return m;
}

function isMonthLook() {
  if (state.preset === "m1" || state.preset === "30d") return true;
  const [from, to] = currentRange();
  const days = (Date.parse(to + "T12:00:00") - Date.parse(from + "T12:00:00")) / 86400000;
  return days >= 25;
}

function shopifyStoreOrders() {
  return ((DATA.shopify && DATA.shopify.orders) || []).filter((o) => o.kind === "store" && inRange(o.date));
}

function shopifyStoreMetrics() {
  const list = shopifyStoreOrders().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const revenue = list.reduce((s, o) => s + (o.total || 0), 0);
  return { orders: list.length, revenue, aov: list.length ? revenue / list.length : 0, list };
}

function paidMediaTotals() {
  const meta = windowMetrics();
  const g = googleAccountMetrics();
  const shop = shopifyStoreMetrics();
  const spend = meta.spend + g.spend;
  const clicks = meta.clicks + g.clicks;
  const imps = meta.imps + g.imps;
  return {
    meta,
    g,
    shop,
    spend,
    clicks,
    imps,
    ctr: imps ? (100 * clicks) / imps : 0,
    cpc: clicks ? spend / clicks : 0,
    cpa: shop.orders ? spend / shop.orders : null,
    roas: spend ? shop.revenue / spend : 0,
  };
}

function flattenAdDaily() {
  const out = [];
  for (const ad of DATA.ads) {
    for (const r of rowsBetween(ad.daily)) {
      out.push({ ...r, concept: ad.concept, lane: ad.lane, variant: ad.variant, format: ad.format, id: ad.id });
    }
  }
  return out;
}

function groupedMetrics(rows, keyFn) {
  const map = {};
  for (const r of rows) {
    const k = keyFn(r);
    (map[k] ||= []).push(r);
  }
  return Object.entries(map)
    .map(([key, list]) => ({ key, m: sumMetrics(list) }))
    .sort((a, b) => b.m.spend - a.m.spend);
}

function weekSlices(rows) {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return [];
  const origin = sorted[0].date;
  const buckets = {};
  for (const r of sorted) {
    const n = Math.floor((Date.parse(r.date + "T12:00:00") - Date.parse(origin + "T12:00:00")) / 86400000 / 7);
    (buckets[n] ||= []).push(r);
  }
  return Object.keys(buckets)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k, i) => {
      const list = buckets[k];
      return { label: `Week ${i + 1}`, from: list[0].date, to: list[list.length - 1].date, m: sumMetrics(list) };
    });
}

function adsWithSpend() {
  return DATA.ads
    .map((ad) => ({ ad, m: adMetrics(ad) }))
    .filter((x) => x.m.spend > 0 || x.m.imps > 0);
}

function rangeEnding(days) {
  const max = DATA.meta.maxDate;
  const min = DATA.meta.minDate;
  return [clamp(addDays(max, -(days - 1)), min, max), max];
}

function rowsIn(list, from, to) {
  return (list || []).filter((r) => r.date >= from && r.date <= to);
}

function adMetricsIn(ad, from, to) {
  return sumMetrics(rowsIn(ad.daily, from, to));
}

function metricsForAd(ad) {
  const lifetime = state.page === "library" || (state.page === "video" && (state.videoLane || "all") !== "all");
  if (lifetime) {
    const m = sumMetrics(ad.daily || []);
    const storePurch = {
      "120249842708870753": 2,
      "120249414668100753": 2,
    };
    if (state.page === "library" && storePurch[ad.id]) {
      m.purch = Math.max(m.purch || 0, storePurch[ad.id]);
      m.cpa = m.purch ? m.spend / m.purch : null;
    }
    return m;
  }
  return adMetrics(ad);
}

function isRetargetName(value) {
  return /retarget|RTG|\bLPV\b/i.test(value || "");
}

function isRetargetAd(ad) {
  return isRetargetName(ad.campaign) || isRetargetName(ad.lane) || isRetargetName(ad.adset);
}

function videoBucket(ad) {
  if (isRetargetAd(ad)) return "rtg";
  const campaign = ad.campaign || "";
  // Add-to-cart learning reused Month 1 videos. The campaign name says Month 2; the concepts do not.
  if (/Add to Cart|Reels Sales Learning/i.test(campaign)) return "other";
  if (/Isolated Test|UGC Cold/i.test(campaign)) return "m2";
  if (/Month 1|Concept Testing/i.test(campaign)) return "m1";
  return "other";
}

function isSalesCampaign(name) {
  return /Purchase|Add to Cart/i.test(name || "") && !/ThruPlay|Traffic/i.test(name || "");
}

function deliveryLabel(status) {
  if (status === "ACTIVE") return "Active";
  if (status === "ADSET_PAUSED") return "Ad set paused";
  if (status === "CAMPAIGN_PAUSED") return "Campaign paused";
  if (status === "PAUSED") return "Paused";
  return status || "—";
}

function firstSpendDate(ad) {
  const days = (ad.daily || []).filter((r) => (r.spend || 0) > 0).map((r) => r.date).sort();
  return days[0] || null;
}

function campaignGroups() {
  const map = {};
  for (const ad of DATA.ads) {
    const key = ad.campaign || "Unassigned";
    (map[key] ||= []).push(ad);
  }
  return Object.entries(map).map(([name, ads]) => {
    const scored = ads.map((ad) => ({ ad, m: adMetrics(ad) }));
    return {
      name,
      short: campaignShort(name),
      ads,
      scored,
      tot: sumMetrics(scored.flatMap((x) => rowsBetween(x.ad.daily))),
      active: ads.filter((ad) => ad.status === "ACTIVE").length,
      paused: ads.filter((ad) => ad.status !== "ACTIVE").length,
      retarget: isRetargetName(name),
      sales: isSalesCampaign(name),
    };
  }).sort((a, b) => b.tot.spend - a.tot.spend || b.active - a.active);
}

function libraryPool() {
  const [from, to] = rangeEnding(7);
  return DATA.ads
    .filter((ad) => ad.status === "ACTIVE" && isSalesCampaign(ad.campaign) && !isRetargetAd(ad))
    .map((ad) => ({ ad, m: adMetricsIn(ad, from, to) }))
    .filter((x) => x.m.spend > 0 || x.m.imps > 0);
}

function runningLabel(ad) {
  const liveIds = new Set([
    "120249414668100753", // Beauty Bestie 1.1
    "120249414677460753", // Whole Self 5.3
    "120249842708870753", // Julia 2
    "120249541354400753", // Whole Self 5.1 priority retargeting
    "120249541366730753", // Social Proof 3.1 LPV cascade, days 2–3
  ]);
  const campaign = ad.campaign || "";
  if (liveIds.has(ad.id) || /Isolated Test Wave [23]/i.test(campaign)) return "Live";
  if (/Concept Testing|Reels Creative|UGC Cold|Isolated Test|ThruPlay/i.test(campaign)) return "Paused";
  if (ad.status === "ACTIVE") return "Live";
  return "Paused";
}

function thumbEl(ad, w) {
  const src = ad.thumb;
  const initials = (ad.concept || "BOW").split(" ").map((w) => w[0]).join("").slice(0, 2);
  return `<img class="thumb" src="${src}" alt="" style="${w ? `width:${w}px;height:${w}px` : ""}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'${initials}'}))" />`;
}

function renderNav() {
  $("nav").innerHTML = PAGES.map(([id, num, label]) =>
    `<button data-page="${id}" class="${state.page === id ? "active" : ""}"><span class="num">${num}</span>${label}</button>`
  ).join("");
  $("nav").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.page = b.dataset.page;
    state.selectedAd = null;
    history.replaceState(null, "", `${location.pathname}${location.search}#${state.page}`);
    render();
  };
}

function renderPeriods() {
  const locked = ["week", "library", "video", "site", "google"].includes(state.page);
  $("periods").classList.toggle("is-locked", locked);
  if (locked) {
    $("periods").innerHTML = "";
    $("customRange").classList.add("hidden");
    return;
  }
  $("periods").innerHTML = PRESETS.map(([id, label]) =>
    `<button class="chip ${state.preset === id ? "active" : ""}" data-p="${id}">${label}</button>`
  ).join("");
  $("periods").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.preset = b.dataset.p;
    if (state.preset === "custom") {
      const [f, t] = currentRange();
      state.from = state.from || f;
      state.to = state.to || t;
    }
    render();
  };
  const custom = $("customRange");
  custom.classList.toggle("hidden", state.preset !== "custom");
  const min = DATA.meta.minDate;
  const max = DATA.meta.maxDate;
  const from = $("fromDate");
  const to = $("toDate");
  from.min = to.min = min;
  from.max = to.max = max;
  const [cf, ct] = currentRange();
  from.value = state.from || cf;
  to.value = state.to || ct;
  from.onchange = () => { state.from = from.value; state.preset = "custom"; render(); };
  to.onchange = () => { state.to = to.value; state.preset = "custom"; render(); };
}

function renderMeta() {
  const [from, to] = currentRange();
  const g = DATA.google && DATA.google.meta;
  const src = g ? "Meta + Google Ads" : "Meta Ads";
  $("metaLine").textContent = state.page === "site"
    ? ((state.siteMonth || "oct") === "sep"
      ? "Data source · Google Analytics, Body of Work · 1 Sep – 30 Sep · Meta cart and checkout from Ads Manager, same month"
      : "Data source · Google Analytics, Body of Work · 1 Oct – 8 Oct · The 8th is this morning · Meta cart and checkout from Ads Manager, same dates")
    : state.page === "week"
    ? "Data source · Meta Ads and Google Ads, Body of Work · 1 Oct – 7 Oct · Google refreshed the morning of 8 Oct"
    : state.page === "google"
    ? "Data source · Google Ads, Body of Work · 1 Oct – 7 Oct · Pulled the morning of 8 Oct · Paid and organic orders also saw a Meta ad"
    : (state.page === "library" || state.page === "video")
    ? "Data source · Meta Ads, Body of Work · 25 Sep – 7 Oct · Ad-level pull the evening of 7 Oct · Today is still open"
    : `Data source · ${src} · ${fmtRange(from, to)} ${to === DATA.meta.maxDate && from !== to ? "(through now)" : ""} · Refreshed ${DATA.meta.pulled} · ${DATA.meta.timezone}`;
  $("crumb").textContent = PAGES.find((p) => p[0] === state.page)[2];
}

function googleCampaigns() {
  return (DATA.google && DATA.google.campaigns) || [];
}

function sumGoogle(rows) {
  const z = { spend: 0, imps: 0, clicks: 0, purch: 0, rev: 0, allConv: 0 };
  for (const r of rows || []) {
    z.spend += r.spend || 0;
    z.imps += r.imps || 0;
    z.clicks += r.clicks || 0;
    z.purch += r.purch || 0;
    z.rev += r.rev || 0;
    z.allConv += r.allConv || 0;
  }
  z.ctr = z.imps ? (100 * z.clicks) / z.imps : 0;
  z.cpc = z.clicks ? z.spend / z.clicks : 0;
  z.cpm = z.imps ? (z.spend / z.imps) * 1000 : 0;
  z.roas = z.spend ? z.rev / z.spend : 0;
  z.cpa = z.purch ? z.spend / z.purch : null;
  return z;
}

function googleAccountMetrics() {
  return sumGoogle(rowsBetween((DATA.google && DATA.google.accountDaily) || []));
}

function openInspector(ad) {
  state.selectedAd = ad.id;
  const m = metricsForAd(ad);
  const sl = runningLabel(ad);
  const st = sl === "Live" ? "promising" : "thin";
  const maxF = Math.max(m.imps, 1);
  $("inspector").classList.add("open");
  const play = PREVIEWS[ad.id];
  const media = play
    ? `<iframe class="preview-frame" src="${play}" allow="autoplay" title="${ad.concept || "Ad"}"></iframe>`
    : thumbEl(ad, 0).replace('class="thumb"', 'class="preview"');
  $("inspector").innerHTML = `
    <button class="close-x" id="closeIns">×</button>
    ${media}
    <h3>${ad.concept}${ad.variant ? " " + ad.variant : ""}</h3>
    <div class="caption">${ad.format} · ${ad.lane} · ${ad.created || "—"}</div>
    <span class="status ${st}">${sl}</span>
    <p style="font-size:14px;margin:12px 0 4px">${ad.headline || ""}</p>
    <p class="caption">${(ad.body || "").slice(0, 280)}</p>
    <div class="kvs">
      <div>Spend<strong>${usd(m.spend)}</strong></div>
      <div>Link CTR<strong>${pct(m.linkCtr)}</strong></div>
      <div>LPVs<strong>${num(m.lpv)}</strong></div>
      <div>Purchases<strong>${num(m.purch)}</strong></div>
      <div>Hook<strong>${m.hook == null ? "—" : pct(m.hook, 2)}</strong></div>
      <div>25% retained<strong>${m.hold == null ? "—" : pct(m.hold, 1)}</strong></div>
      <div>Completion<strong>${m.complete == null ? "—" : pct(m.complete, 1)}</strong></div>
      <div>Engagement<strong>${pct(m.engRate)}</strong></div>
    </div>
    <div class="caption">${state.page === "library" || (state.page === "video" && (state.videoLane || "all") !== "all") ? "Performance since the ad launched" : "Performance funnel · selected window"}</div>
    <div class="funnel">
      ${[
        ["Impressions", m.imps, m.imps],
        ["Clicks", m.clicks, m.clicks],
        ["Link clicks", m.link, m.link],
        ["Landing page views", m.lpv, m.lpv],
        ["Add to cart", m.atc, m.atc],
        ["Checkout", m.ic, m.ic],
        ["Purchases", m.purch, m.purch],
      ].map(([l, v]) => `
        <div class="frow"><span>${l}</span><span>${num(v)}</span>
          <div class="ftrack"><div class="ffill" style="width:${Math.max(2, (100 * v) / maxF)}%"></div></div>
        </div>`).join("")}
    </div>
    ${ad.isVideo ? `<div class="caption">Retention of video plays · 25% ${m.hold == null ? "—" : pct(m.hold,1)} · completion ${m.complete == null ? "—" : pct(m.complete,1)}</div>` : ""}
  `;
  $("closeIns").onclick = () => { state.selectedAd = null; $("inspector").classList.remove("open"); $("inspector").innerHTML = ""; render(); };
}

function monthInsightsHtml() {
  if (!isMonthLook()) {
    return `<p class="caption">Select <strong>Month 1</strong> for the 17 Aug–17 Sep success story. The tiles above still follow whatever window you pick.</p>`;
  }
  return `
    <section class="story">
      <header class="story-intro">
        <div class="k">Month 1 success story</div>
        <h2>Building the foundation for scale.</h2>
        <p>Month 1 (August 17–September 17) gave us a strong foundation for the next phase of growth. Through structured testing across Meta and Google, we identified the audiences, messages, creative concepts, and placements most likely to drive future performance.</p>
        <p>Paid media generated 13 Shopify online-store orders and $347 in initial revenue for Women’s Multivitamin. First-click, 9 came from Meta, 3 from Instagram, and 1 from Google. Nine customers used BOW15, validating promotional messaging as an effective conversion tool.</p>
      </header>

      <div class="proof-row five">
        <div class="proof"><div class="v">13</div><div class="l">Shopify orders</div><div class="n">Online store · Women’s Multivitamin</div></div>
        <div class="proof"><div class="v">$347</div><div class="l">Store revenue</div><div class="n">Initial paid-media revenue</div></div>
        <div class="proof"><div class="v">9</div><div class="l">Meta first-click</div><div class="n">Paid Meta</div></div>
        <div class="proof"><div class="v">3</div><div class="l">Instagram</div><div class="n">First-click</div></div>
        <div class="proof"><div class="v">1</div><div class="l">Google</div><div class="n">First-click</div></div>
      </div>

      <nav class="story-toc" aria-label="Month 1 chapters">
        <span><b>01</b> Audience</span>
        <span><b>02</b> Channel</span>
        <span><b>03</b> Messaging</span>
        <span><b>04</b> Creative</span>
        <span><b>05</b> Funnel</span>
        <span><b>06</b> Month 2</span>
      </nav>

      <article class="chapter">
        <div class="ch-num">01</div>
        <div class="ch-body">
          <div class="k">Audience learnings</div>
          <h3>Women 25–34 emerged as the strongest growth audience.</h3>
          <p>They generated the highest purchase and checkout volume, giving us a clear primary audience for Month 2.</p>
          <div class="trio">
            <div class="cell lead">
              <div class="k">Primary · scale</div>
              <div class="who">Women 25–34</div>
              <p>Highest purchase and checkout volume. This is the proven growth audience and where the majority of Month 2 investment belongs.</p>
            </div>
            <div class="cell">
              <div class="k">Efficiency test</div>
              <div class="who">Women 18–24</div>
              <p>Strongest early efficiency signal — a purchase on lower spend. An important controlled test as more conversion data comes in.</p>
            </div>
            <div class="cell">
              <div class="k">Secondary</div>
              <div class="who">Women 35–44</div>
              <p>Purchase activity and strong link engagement. A valuable supporting segment, not the core spend lane.</p>
            </div>
          </div>
          <div class="achieve"><strong>Month 1 achievement.</strong> We moved from broad demographic testing to a focused audience strategy led by women ages 25–34, with two promising supporting segments.</div>
        </div>
      </article>

      <article class="chapter">
        <div class="ch-num">02</div>
        <div class="ch-body">
          <div class="k">Channel and placement learnings</div>
          <h3>Meta—particularly Instagram—established itself as the primary acquisition channel.</h3>
          <div class="place-grid">
            <div class="place"><strong>Instagram Feed</strong><p>Generated the most checkout activity. One of the placements closest to purchase for Month 2.</p></div>
            <div class="place"><strong>Instagram Reels + Facebook Reels</strong><p>Produced the strongest purchase signals. Concentrate conversion-focused Meta spend here with Feed.</p></div>
            <div class="place"><strong>Facebook Feed</strong><p>An early purchase on approximately $89 in spend — another placement opportunity for continued testing.</p></div>
            <div class="place"><strong>Instagram Stories</strong><p>Successfully expanded reach and introduced the brand. Month 2 can now concentrate around placements closer to purchase.</p></div>
          </div>
          <p>Google launched on September 11 and produced an encouraging early result. Google Shopping generated a purchase through the high-intent search term “women’s multivitamin,” validating Shopping as a promising acquisition channel. Performance Max also began building traffic and audience data that can inform future optimization.</p>
          <div class="achieve"><strong>Month 1 achievement.</strong> We identified Instagram Feed, Instagram Reels, Facebook Reels, and Google Shopping as the strongest opportunities for conversion-focused growth.</div>
        </div>
      </article>

      <article class="chapter">
        <div class="ch-num">03</div>
        <div class="ch-body">
          <div class="k">Messaging learnings</div>
          <h3>Customers respond when the product is designed for their life stage.</h3>
          <p>Whole Self Optimizer emerged as the strongest conversion message. Positioning the product as a precision formula “built for women in their 20s and 30s” generated the clearest combination of purchases and checkout activity — not as another general multivitamin.</p>
          <div class="rank">
            <div class="rank-row lead">
              <div class="rn">01</div>
              <div>
                <h4>Whole Self Optimizer — conversion lead</h4>
                <p>Science and product specificity lead the conversion story. This is the message to scale.</p>
              </div>
            </div>
            <div class="rank-row">
              <div class="rn">02</div>
              <div>
                <h4>Social Proof — retargeting layer</h4>
                <p>Demonstrated conversion potential. Future UGC will reinforce Whole Self by showing authentic customer experiences and product validation.</p>
              </div>
            </div>
            <div class="rank-row">
              <div class="rn">03</div>
              <div>
                <h4>Beauty Bestie — supporting proof</h4>
                <p>Strong engagement and meaningful checkout activity. Routine, beauty, biotin, and decaf green tea strengthen the science-led Whole Self message.</p>
              </div>
            </div>
            <div class="rank-row">
              <div class="rn">04</div>
              <div>
                <h4>Hot Girl Wind Down — attention</h4>
                <p>Strongest Month 1 link CTR at approximately 1.6%. Lifestyle-led creative captures attention and introduces new audiences to the brand.</p>
              </div>
            </div>
          </div>
          <div class="achieve"><strong>Month 1 achievement.</strong> Testing revealed a clear message hierarchy — science and product specificity lead the conversion story, while beauty, lifestyle, and social proof strengthen engagement and consideration.</div>
        </div>
      </article>

      <article class="chapter">
        <div class="ch-num">04</div>
        <div class="ch-body">
          <div class="k">Creative learnings</div>
          <h3>Whole Self is a repeatable creative direction.</h3>
          <p>Whole Self was the strongest overall creative concept, generating three Meta-attributed purchases and 15 checkouts. Two executions stood out:</p>
          <div class="exec">
            <div class="cell">
              <div class="k">5.3 carousel</div>
              <div class="quote">“Most multis are made for everyone.”</div>
            </div>
            <div class="cell">
              <div class="k">5.1 video</div>
              <div class="quote">“Built for women in their 20s and 30s—finally.”</div>
            </div>
          </div>
          <p>Social Proof generated two purchases, confirming its value as a conversion-reinforcement concept. Beauty Bestie generated approximately 31% engagement and eight checkouts, demonstrating strong audience interest in the product’s beauty and wellness benefits. Clean Girl 4.1 generated an early purchase, giving us another creative direction to monitor as more data develops.</p>
          <p>Early Month 2 UGC strengthened the Whole Self finding: Julia 2 Cold produced the first UGC purchase using the same core positioning, at approximately $89 pixel-reported CPA.</p>
          <div class="achieve"><strong>Month 1 achievement.</strong> We identified a repeatable creative direction that can now be expanded across UGC, video, carousel, and static formats.</div>
        </div>
      </article>

      <article class="chapter">
        <div class="ch-num">05</div>
        <div class="ch-body">
          <div class="k">Funnel and optimization progress</div>
          <h3>Traffic quality improved. Shopify is the commercial scoreboard.</h3>
          <p>Weekly CTR increased from approximately 1.9% to 3.3%, while checkout volume remained steady even as spend became more focused. Customers demonstrated meaningful purchase intent.</p>
          <div class="funnel-facts">
            <div><div class="v">1.9–3.3%</div><div class="l">Weekly CTR</div></div>
            <div><div class="v">51</div><div class="l">Meta checkouts</div></div>
            <div><div class="v">13</div><div class="l">Store orders</div></div>
            <div><div class="v">9</div><div class="l">BOW15 orders</div></div>
          </div>
          <p>Shopify remains the primary commercial scoreboard, so Month 2 optimization reflects actual store performance.</p>
          <div class="achieve"><strong>Month 1 achievement.</strong> We improved traffic quality, maintained checkout activity with more focused spend, and established a clearer measurement framework for Month 2.</div>
        </div>
      </article>

      <article class="chapter">
        <div class="ch-num">06</div>
        <div class="ch-body">
          <div class="k">Month 2 growth strategy</div>
          <h3>Build on the strongest combination identified during testing.</h3>
          <ul class="plan">
            <li>Prioritize women ages 25–34.</li>
            <li>Maintain controlled tests for women ages 18–24 and 35–44.</li>
            <li>Concentrate Meta investment in Instagram Feed and Reels.</li>
            <li>Expand Whole Self across UGC, video, carousel, and static formats.</li>
            <li>Use Beauty Bestie benefits as supporting proof within the Whole Self story.</li>
            <li>Use UGC and Social Proof to strengthen retargeting.</li>
            <li>Develop Google Shopping around high-intent searches.</li>
            <li>Use Shopify orders as the primary performance benchmark.</li>
          </ul>
        </div>
      </article>

      <aside class="takeaway">
        <div class="k">Overall Month 1 takeaway</div>
        <h3>Month 1 successfully transformed broad testing into a focused growth strategy.</h3>
        <p>We now know who is most likely to buy, which message creates the strongest purchase intent, which placements move customers closest to conversion, and how creative roles should work together. The foundation is now in place to enter Month 2 with greater focus: the right audience, a validated conversion message, stronger placement allocation, and a clear creative system for continued growth.</p>
      </aside>
    </section>
  `;
}

function ugcInsightHtml() {
  const cold = ugcBundle("UGC Cold");
  const rtg = ugcBundle("UGC Retargeting");
  if (!cold.tot.spend && !rtg.tot.spend) return "";
  const tot = sumMetrics([
    ...cold.items.flatMap((x) => rowsBetween(x.ad.daily)),
    ...rtg.items.flatMap((x) => rowsBetween(x.ad.daily)),
  ]);
  const leader = [...cold.items, ...rtg.items].sort((a, b) => b.m.spend - a.m.spend)[0];
  const buyer = [...cold.items, ...rtg.items].find((x) => x.m.purch > 0);
  return `
    <div class="insight wide" style="margin-top:16px">
      <div class="k">Month 2 · UGC live since 11 Sep</div>
      <h3>${buyer
        ? `${buyer.ad.variant} on ${buyer.ad.lane} produced UGC’s first purchase.`
        : "UGC is in market on the Whole Self hook."}</h3>
      <p>Creator videos launched in cold prospecting and website-visitor retargeting, using <strong>Built for women in their 20s and 30s—finally.</strong> In this window: ${usd(tot.spend)} spend, ${num(tot.purch)} purchase${tot.purch === 1 ? "" : "s"}, ${num(tot.ic)} checkouts, ${pct(tot.linkCtr)} link CTR.</p>
      <p>Cold spent ${usd(cold.tot.spend)}${cold.tot.purch ? ` and converted (${num(cold.tot.purch)} purchase, ${usd(cold.tot.rev)}).` : "."} Retargeting spent ${usd(rtg.tot.spend)} with ${num(rtg.tot.purch)} purchases — UGC is the new social-proof lane there, not a new Social Proof concept family.</p>
      ${leader ? `<p>Heaviest delivery: <strong>${leader.ad.concept} ${leader.ad.variant}</strong> · ${usd(leader.m.spend)} · ${pct(leader.m.linkCtr)} link CTR. Open Audience diagnosis or the creative library for every creator cut.</p>` : ""}
      <p class="caption">${DATA.meta.ugcNote || ""}</p>
    </div>
  `;
}

function adLine(x) {
  const name = `${x.ad.concept}${x.ad.variant ? " " + x.ad.variant : ""}`;
  return `${name} · ${x.ad.lane}`;
}

function pageStory() {
  const week = "24 Sep – 30 Sep";
  const cell = (v, l, h) => `<div class="score"><div class="v">${v}</div><div class="l">${l}</div>${h ? `<div class="h">${h}</div>` : ""}</div>`;
  return `
    <div class="hero">
      <div>
        <div class="caption" style="color:#9bb0aa">01 / This week</div>
        <h1>This week</h1>
        <ul>
          <li>Eight purchases in these 7 days. Six on Meta, two on Google.</li>
          <li>Whole Self 5.3 bought three times, at $242. Julia 2 bought once, at $205. Founder 2.1 bought once, at $122.</li>
          <li>Science 3.1 bought once, at $172. That order was $2.99, and Wave 1 stays paused.</li>
          <li>Both Google purchases are on Performance Max. One on 28 Sep, and one on 30 Sep at $34.</li>
          <li>Whole Self 5.3 is the ad that keeps buying. Five purchases in total, about $112 each.</li>
        </ul>
      </div>
      <div class="when">Store orders
        <b>${week}</b>
        Meta and Google, same 7 days
      </div>
    </div>

    <div class="score-grid compact four">
      ${cell("8", "Purchases", "6 Meta · 2 Google")}
      ${cell("3", "Whole Self 5.3", "$242 this week · about $81")}
      ${cell("1", "Julia 2", "$205 this week")}
      ${cell("2", "Google", "Both on Performance Max")}
    </div>

    <h2>Meta, this week</h2>
    <p class="caption">${week}. The account spent $2,434. Reach, likes, shares, and the engagement rate cover the whole account. Clicks, landing page views, add to carts, checkouts, purchases, and leads are the same 7 days.</p>

    <div class="band">
      <h3>Ad engagement</h3>
      <div class="score-grid compact">
        ${cell(num(20838), "Reach", "Unique")}
        ${cell(num(116), "Likes + shares", "103 likes · 13 shares")}
        ${cell(num(894), "Clicks", "")}
        ${cell("2.25%", "CTR", num(39774) + " impressions")}
        ${cell("13.4%", "Engagement rate", "5,337 ÷ impressions")}
      </div>
    </div>
    <div class="band">
      <h3>Website behaviour</h3>
      <div class="score-grid compact four">
        ${cell(num(396), "Landing page views", "")}
        ${cell(num(27), "Add to cart", "")}
        ${cell(num(49), "Initiate checkout", "")}
        ${cell("6", "Purchases", "5.3 · Julia 2 · Founder 2.1 · Science 3.1")}
      </div>
    </div>
    <div class="band">
      <h3>Website leads</h3>
      <div class="score-grid compact">
        ${cell(num(440), "Website leads", "")}
      </div>
    </div>
    <div class="band">
      <h3>Instagram engagement</h3>
      <div class="score-grid compact">
        ${cell(num(36), "Saves", "")}
        ${cell(num(5), "Comments", "")}
        ${cell(num(13), "Shares", "")}
      </div>
    </div>

    <h2>Account structure</h2>
    <p class="caption">Training and engagement build the audiences. Retargeting stays with people who already visited, added to cart, or watched. Prospecting is where we look for an ad that can buy more than once.</p>
    <div class="flow">
      <div class="flow-top">
        <article class="flow-card">
          <div class="step">01</div>
          <h3>Pixel training</h3>
          <p>Add to cart and traffic. These campaigns show us who is ready to shop, before we ask them to buy.</p>
          <ul class="camp-list">
            <li><b>Add to cart</b><span>BOW | US | ABO | Add to Cart | Month 2 | Reels Sales Learning | 08.22.26</span></li>
            <li><b>Traffic</b><span>BOW | US | ABO | Traffic | IG Profile | Founder 2.1 | 09.27.26</span></li>
          </ul>
        </article>
        <article class="flow-card">
          <div class="step">02</div>
          <h3>Engagement</h3>
          <p>Video views and Instagram engagement. Watchers and interactors become the people retargeting can use.</p>
          <ul class="camp-list">
            <li><b>Video views</b><span>BOW | US | ABO | ThruPlay | Month 1 | Video Engagement Sequence v2 | 08.22.26</span></li>
          </ul>
        </article>
        <article class="flow-card">
          <div class="step">03</div>
          <h3>Evergreen retargeting</h3>
          <div class="pills">
            <div class="pill"><b>Cascade · website visits</b><span>BOW | US | ABO | Purchase | Month 1 | LPV Cascade Retargeting | 08.22.26</span></div>
            <div class="pill"><b>Priority · add to carts</b><span>BOW | US | ABO | Purchase | Month 1 | Priority Retargeting | 08.22.26</span></div>
            <div class="pill"><b>Engagement · watched or interacted</b><span>BOW | US | ABO | Purchase | Month 2 | UGC Retargeting | 09.11.26</span></div>
          </div>
        </article>
      </div>
      <article class="flow-card sales">
        <div class="step">04</div>
        <h3>Prospecting and creative testing</h3>
        <p>Sales objective. This is where a new ad has to earn a purchase.</p>
        <div class="month-split">
          <div class="month-pane">
            <div class="k">Month 1</div>
            <h4>Concepts, then more versions.</h4>
            <p>We tested a concept, then made more versions of it. The budget was shared across those versions.</p>
            <ul class="camp-list">
              <li><b>Concept testing</b><span>BOW | US | ABO | Purchase | Month 1 | Concept Testing | 08.14.26</span></li>
              <li><b>Reels test</b><span>BOW | US | ABO | Purchase | Month 1 | Reels Creative Test | 08.21.26</span></li>
            </ul>
          </div>
          <div class="month-pane now">
            <div class="k">Month 2</div>
            <h4>One ad, its own budget.</h4>
            <p>Each ad spends on its own, so we can see if it can bring purchases one after another. That is the ad we scale. Whole Self 5.3 is the one doing that.</p>
            <ul class="camp-list">
              <li><b>Wave 1</b><span>BOW | US | ABO | Purchase | Month 2 | Isolated Test | 09.25.26</span></li>
              <li><b>Wave 2</b><span>BOW | US | ABO | Purchase | Month 2 | Isolated Test Wave 2 | 09.27.26</span></li>
              <li><b>Wave 3</b><span>BOW | US | ABO | Purchase | Month 2 | Isolated Test Wave 3 | 09.30.26</span></li>
              <li><b>UGC cold</b><span>BOW | US | ABO | Purchase | Month 2 | UGC Cold | 09.11.26</span></li>
            </ul>
          </div>
        </div>
      </article>
    </div>

    <h2>What changed</h2>
    <p class="caption">${week}. Meta spent $2,434 and recorded 6 purchases. Google spent $81 and recorded 2, both on Performance Max.</p>
    <div class="insight">
      <div class="k">Month 1</div>
      <h3>We paused most of Month 1.</h3>
      <ul>
        <li>Five concepts, with several versions of each.</li>
        <li>Still on: Beauty Bestie 1.1 and Whole Self 5.3.</li>
        <li>Paused: the other versions of Beauty Bestie, Social Proof, Clean Girl, and Whole Self, and all of Hot Girl Wind Down.</li>
        <li>Social Proof 3.1 stories and Clean Girl 4.1 each had one purchase, and the cost went past $300, so those came off.</li>
        <li>Whole Self 5.3 bought three more times this week, at $242.</li>
      </ul>
    </div>
    <div class="insight" style="margin-top:16px">
      <div class="k">Every ad that has purchased</div>
      <h3>The cost per purchase is why almost all of Month 1 is paused.</h3>
      <p>A single purchase that climbed past $300 came off. Whole Self 5.3 has five purchases, three of them this week, so it stays on. Science 3.1’s purchase was a $2.99 order, so that wave stays paused.</p>
      <div class="table-wrap" style="margin-top:14px">
        <table class="plain">
          <thead><tr>
            <th>Ad</th>
            <th>Where</th>
            <th class="num">Purchases</th>
            <th class="num">Cost per purchase</th>
            <th>Now</th>
          </tr></thead>
          <tbody>
            <tr>
              <td><div class="name">Social Proof 3.1 stories</div></td>
              <td>Month 1</td>
              <td class="num">1</td>
              <td class="num">$325</td>
              <td>Paused</td>
            </tr>
            <tr>
              <td><div class="name">Clean Girl 4.1</div></td>
              <td>Month 1</td>
              <td class="num">1</td>
              <td class="num">$321</td>
              <td>Paused</td>
            </tr>
            <tr>
              <td><div class="name">Social Proof 3.1</div><div class="sub">LPV cascade, days 2–3</div></td>
              <td>Retargeting</td>
              <td class="num">1</td>
              <td class="num">$201</td>
              <td>Still on, $5/day</td>
            </tr>
            <tr>
              <td><div class="name">Whole Self 5.1</div></td>
              <td>Priority retargeting</td>
              <td class="num">2</td>
              <td class="num">$186</td>
              <td>Still on</td>
            </tr>
            <tr>
              <td><div class="name">Science 3.1</div><div class="sub">Wave 1</div></td>
              <td>Month 2</td>
              <td class="num">1</td>
              <td class="num">$172 · $2.99 order</td>
              <td>Paused</td>
            </tr>
            <tr>
              <td><div class="name">Julia 2</div></td>
              <td>Month 2, UGC Cold</td>
              <td class="num">2</td>
              <td class="num">$147 · 1 this week at $205</td>
              <td>Still on</td>
            </tr>
            <tr>
              <td><div class="name">Founder 2.1</div><div class="sub">Wave 2</div></td>
              <td>Month 2</td>
              <td class="num">1</td>
              <td class="num">$122</td>
              <td>Still on</td>
            </tr>
            <tr>
              <td><div class="name">Whole Self 5.3</div></td>
              <td>Month 1</td>
              <td class="num">5</td>
              <td class="num">$112 · 3 this week at $242</td>
              <td>Still on</td>
            </tr>
            <tr>
              <td><div class="name">Beauty Bestie 1.1</div></td>
              <td>Month 1</td>
              <td class="num">2</td>
              <td class="num">$178 this week, no purchase</td>
              <td>Still on</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <h2>What we are keeping</h2>
    <p class="caption">${week} · Whole Self 5.3 is the one that has earned more budget</p>
    <div class="insight">
      <div class="k">Still on</div>
      <h3>Whole Self 5.3 bought three times this week.</h3>
      <ul>
        <li><strong>Whole Self 5.3</strong> — three purchases this week, $242, about $81 each. Five purchases in total, $558, about $112. Still on.</li>
        <li><strong>Julia 2</strong> — one purchase this week, $205. Two in total, about $147. Still on.</li>
        <li><strong>Founder 2.1</strong> — first purchase, $122, on Wave 2. A second purchase in a row is what would raise this one.</li>
        <li><strong>Beauty Bestie 1.1</strong> — still on. $178 this week, and no purchase.</li>
      </ul>
    </div>
    <div class="insight" style="margin-top:16px">
      <div class="k">Month 2</div>
      <h3>Wave 1 is paused. Wave 2 and Wave 3 are live.</h3>
      <ul>
        <li>Wave 1, Friday 25 Sep, paused. UGC 1.2, Founder 2.3, Science 3.1, Beauty Bestie 4.4, Whole Self 5.4. Science 3.1 is the one that purchased, and the order was $2.99.</li>
        <li>Wave 2, Sunday 27 Sep, live at $40 a day. Founder 2.1 purchased. UGC 1.1, Science 3.3, Beauty Bestie 4.3, and Whole Self 5.2 did not.</li>
        <li>Wave 3, Wednesday 30 Sep, live at $40 a day. UGC 1.3, Founder 2.2, Science 3.4, Beauty Bestie 4.1, Whole Self 5.5. $163 spent, 2 add to carts, 1 checkout, no purchase yet.</li>
        <li>On UGC Cold, Julia 2 is the creator still running.</li>
      </ul>
    </div>
  `;
}

function pageDiagnosis() {
  const groups = DATA.concepts.map((name) => {
    const items = adsWithSpend().filter((x) => x.ad.concept === name);
    const tot = sumMetrics(items.flatMap((x) => rowsBetween(x.ad.daily)));
    const meta = DATA.conceptMeta[name] || {};
    return { name, items, tot, meta };
  }).filter((g) => g.tot.spend > 0);

  return `
    <h1>Audience diagnosis</h1>
    <p class="lede">Month 1 interest-and-behavior bundles, plus Month 2 UGC in cold prospecting and site-visitor retargeting. Click a bundle for asset evidence.</p>
    <p class="caption">${fmtRange(...currentRange())} · click a bundle to open asset evidence</p>
    ${groups.map((g) => {
      const conv = g.tot.purch > 0;
      return `<div class="bundle ${conv ? "conversion" : ""}" data-bundle="${g.name}">
        <div class="bundle-head">
          <div>
            <div class="caption">${(g.meta.ageMin && g.meta.ageMax) ? `Women ${g.meta.ageMin}–${g.meta.ageMax}` : "Women 18–39"} · ${g.items.length} creative variants</div>
            <h3>${g.name}</h3>
          </div>
          <div><div class="statv">${usd(g.tot.spend)}</div><div class="statl">Spend</div></div>
          <div><div class="statv">${pct(g.tot.engRate, 2)}</div><div class="statl">Engagement</div></div>
          <div><div class="statv">${pct(g.tot.linkCtr, 2)}</div><div class="statl">Link CTR</div></div>
          <div><div class="statv">${num(g.tot.lpv)}</div><div class="statl">LPV</div></div>
          <div><div class="statv">${g.tot.hook == null ? "—" : pct(g.tot.hook, 2)}</div><div class="statl">Hook</div></div>
          <div class="btn">${conv ? "Conversion lane" : "Open diagnosis"}</div>
        </div>
        <div class="bundle-body">
          <div style="padding:12px 18px;font-size:13px;color:var(--muted)">
            Interests: ${(g.meta.interests || []).join(", ") || (g.name.startsWith("UGC") ? "Creator UGC · Whole Self hook" : "—")}
            ${(g.meta.behaviors || []).length ? " · " + (g.name.startsWith("UGC") ? "Audience: " : "Behaviors: ") + g.meta.behaviors.join(", ") : g.name === "UGC Cold" ? " · Broad women 18–45" : ""}
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Creative</th><th>Format / placement</th>
                <th class="num">Spend</th><th class="num">Engagement</th><th class="num">Link CTR</th>
                <th class="num">LPV</th><th class="num">ATC</th><th class="num">IC</th><th class="num">Purchases</th><th class="num">Hook</th>
              </tr></thead>
              <tbody>
                ${g.items.sort((a,b)=>b.m.spend-a.m.spend).map((x) => `
                  <tr data-ad="${x.ad.id}">
                    <td><div class="ad-cell">${thumbEl(x.ad)}<div><div class="name">${x.ad.variant || x.ad.concept}</div><div class="sub">${(x.ad.headline || "").slice(0,48)}</div></div></div></td>
                    <td>${x.ad.format}<div class="sub">${x.ad.lane}</div></td>
                    <td class="num">${usd(x.m.spend)}</td>
                    <td class="num">${pct(x.m.engRate)}</td>
                    <td class="num">${pct(x.m.linkCtr)}</td>
                    <td class="num">${num(x.m.lpv)}</td>
                    <td class="num">${num(x.m.atc)}</td>
                    <td class="num">${num(x.m.ic)}</td>
                    <td class="num">${num(x.m.purch)}</td>
                    <td class="num">${x.m.hook == null ? "—" : pct(x.m.hook)}</td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    }).join("")}
  `;
}

function pageDemographics() {
  const rows = rowsBetween(DATA.ageDaily).filter((r) => r.gender === "female" && r.age !== "Unknown");
  const ages = ["18-24", "25-34", "35-44"];
  const grouped = ages.map((age) => {
    const slice = rows.filter((r) => r.age === age);
    return { age, m: sumMetrics(slice) };
  });
  const totalLink = grouped.reduce((s, g) => s + g.m.link, 0) || 1;
  const leader = [...grouped].sort((a, b) => b.m.link - a.m.link)[0];
  const maxLink = Math.max(...grouped.map((g) => g.m.link), 1);
  return `
    <h1>${leader.age} drove the most link clicks.</h1>
    <p class="lede">Female age-group evidence in the selected window. 25–34 is still the volume engine; younger and older bands can win on rate.</p>
    <p class="caption">${fmtRange(...currentRange())} · women only · account-level</p>
    ${grouped.map((g) => `
      <div class="age-row">
        <div style="font-family:var(--serif);font-size:28px">${g.age}</div>
        <div class="age-track"><div class="age-fill" style="width:${(100 * g.m.link) / maxLink}%"></div></div>
        <div class="age-meta">${pct(g.m.linkCtr)} link CTR · ${num(g.m.link)} clicks (${pct((100 * g.m.link) / totalLink, 1)})</div>
      </div>`).join("")}
    <h2>Female age-group evidence</h2>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Gender</th><th>Age</th><th class="num">Link clicks</th><th class="num">Share of link clicks</th>
          <th class="num">Link CTR</th><th class="num">Clicks (all)</th><th class="num">Impressions</th>
          <th class="num">Reach</th><th class="num">Spend</th>
        </tr></thead>
        <tbody>
          ${grouped.map((g) => `
            <tr>
              <td>Female</td><td>${g.age}</td>
              <td class="num">${num(g.m.link)}</td>
              <td class="num">${pct((100 * g.m.link) / totalLink, 2)}</td>
              <td class="num">${pct(g.m.linkCtr)}</td>
              <td class="num">${num(g.m.clicks)}</td>
              <td class="num">${num(g.m.imps)}</td>
              <td class="num">${num(g.m.reach)}</td>
              <td class="num">${usd(g.m.spend)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function pageLibrary() {
  const follows = {
    "120249414668100753": 21,
    "120249414671820753": 20,
    "120249414674400753": 9,
    "120249414675160753": 5,
    "120249414677460753": 4,
    "120249414671080753": 2,
    "120249414677100753": 1,
    "120249414670200753": 1,
    "120249414671470753": 1,
    "120249414668420753": 1,
    "120249842708870753": 8,
    "120249842709470753": 1,
    "120249842711810753": 1,
    "120250058080340753": 3,
    "120250058080610753": 2,
    "120250058080790753": 2,
    "120250058080950753": 1,
  };
  const month1Live = new Set(["120249414668100753", "120249414677460753"]);
  const laneOf = (ad) => {
    if (/Isolated Test Wave 3/i.test(ad.campaign)) return "wave3";
    if (/Isolated Test Wave 2/i.test(ad.campaign)) return "wave2";
    if (/Isolated Test/i.test(ad.campaign)) return "wave1";
    if (/Concept Testing/i.test(ad.campaign)) return "m1";
    return null;
  };
  const pack = (ad) => {
    const m = sumMetrics(ad.daily || []);
    const storePurch = {
      "120249842708870753": 2,
      "120249414668100753": 2,
    };
    const purch = Math.max(m.purch || 0, storePurch[ad.id] || 0);
    return { ad, m, purch, follows: follows[ad.id] || 0 };
  };
  const all = DATA.ads.map(pack).filter((x) => laneOf(x.ad));
  const month = state.testMonth || "m2";
  const wave = state.testWave || "all";
  const tableOf = (items, flagFor) => `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Creative</th>
          <th class="num">Link clicks</th>
          <th class="num">Add to carts</th>
          <th class="num">Initiate checkout</th>
          <th class="num">Purchases</th>
          <th class="num">Hook</th>
          <th class="num">Completion</th>
          <th class="num">Followers</th>
          <th class="num">Spend</th>
          <th>Status</th>
        </tr></thead>
        <tbody>
          ${items.map((x) => {
            const flag = flagFor(x);
            const live = flag === "Live";
            return `<tr data-ad="${x.ad.id}" class="${state.selectedAd === x.ad.id ? "selected" : ""}">
              <td><div class="ad-cell">${thumbEl(x.ad)}<div><div class="name">${x.ad.concept}${x.ad.variant ? " " + x.ad.variant : ""}</div><div class="sub">${x.ad.format}</div></div></div></td>
              <td class="num">${num(x.m.link)}</td>
              <td class="num">${num(x.m.atc)}</td>
              <td class="num">${num(x.m.ic)}</td>
              <td class="num">${num(x.purch)}</td>
              <td class="num">${x.m.hook == null ? "—" : pct(x.m.hook)}</td>
              <td class="num">${x.m.complete == null ? "—" : pct(x.m.complete)}</td>
              <td class="num">${num(x.follows)}</td>
              <td class="num">${usd(x.m.spend)}</td>
              <td><span class="status ${live ? "promising" : "thin"}">${flag}</span></td>
            </tr>`;
          }).join("") || `<tr><td colspan="10">No creatives in this cut.</td></tr>`}
        </tbody>
      </table>
    </div>`;
  const section = (title, note, items, flagFor) => `
    <h2>${title}</h2>
    <p class="caption">${note}</p>
    ${tableOf(items, flagFor)}`;
  const wave1 = all.filter((x) => laneOf(x.ad) === "wave1");
  const wave2 = all.filter((x) => laneOf(x.ad) === "wave2");
  const wave3 = all.filter((x) => laneOf(x.ad) === "wave3");
  const month1 = all.filter((x) => laneOf(x.ad) === "m1")
    .sort((a, b) => (b.purch - a.purch) || (b.follows - a.follows) || (b.m.spend - a.m.spend));
  let body = "";
  if (month === "m1") {
    body = section(
      "Month 1",
      "Five concepts, with several versions of each. Purchases and followers run through 30 Sep. Click a row for hook, completion, and the video.",
      month1,
      (x) => (month1Live.has(x.ad.id) ? "Live" : "Paused")
    );
  } else if (wave === "wave1") {
    body = section(
      "Wave 1 · Friday 25 Sep",
      "We launched these five on Friday and paused the set. Science 3.1 purchased once. Click a row for hook, completion, and the video.",
      wave1,
      () => "Paused"
    );
  } else if (wave === "wave2") {
    body = section(
      "Wave 2 · Sunday 27 Sep",
      "Live, each ad on its own budget. Founder 2.1 is the one that purchased. Click a row for hook, completion, and the video.",
      wave2,
      () => "Live"
    );
  } else if (wave === "wave3") {
    body = section(
      "Wave 3 · Wednesday 30 Sep",
      "Live as of today, $40 a day each. Click a row for hook, completion, and the video.",
      wave3,
      () => "Live"
    );
  } else {
    body = section(
      "Wave 1 · Friday 25 Sep",
      "We launched these five on Friday and paused the set. Science 3.1 purchased once. Click a row for hook, completion, and the video.",
      wave1,
      () => "Paused"
    ) + section(
      "Wave 2 · Sunday 27 Sep",
      "Live, each ad on its own budget. Founder 2.1 is the one that purchased. Click a row for hook, completion, and the video.",
      wave2,
      () => "Live"
    ) + section(
      "Wave 3 · Wednesday 30 Sep",
      "Live as of today, $40 a day each. Click a row for hook, completion, and the video.",
      wave3,
      () => "Live"
    );
  }
  return `
    <h1>Creative testing</h1>
    <p class="lede">Month 2 runs in waves. We launch a set, give each ad its own budget, and pause the set if no single ad starts producing orders in a row. The ad that does is the one we raise.</p>
    <div class="sort-row">
      <button class="chip ${month === "m1" ? "active" : ""}" data-tmonth="m1">Month 1</button>
      <button class="chip ${month === "m2" ? "active" : ""}" data-tmonth="m2">Month 2</button>
      ${month === "m2" ? `
        <button class="chip ${wave === "all" ? "active" : ""}" data-twave="all">All waves</button>
        <button class="chip ${wave === "wave1" ? "active" : ""}" data-twave="wave1">Wave 1</button>
        <button class="chip ${wave === "wave2" ? "active" : ""}" data-twave="wave2">Wave 2</button>
        <button class="chip ${wave === "wave3" ? "active" : ""}" data-twave="wave3">Wave 3</button>
      ` : ""}
    </div>
    ${body}
  `;
}

const VIDEO_SORTS = [
  ["hook", "Hook rate"],
  ["engRate", "Engagement"],
  ["purch", "Purchases"],
  ["linkCtr", "Link CTR"],
  ["ctr", "CTR"],
  ["hold", "Hold 25%"],
  ["complete", "Completion"],
  ["ic", "Checkouts"],
  ["atc", "Add to cart"],
  ["lpv", "LPVs"],
  ["spend", "Spend"],
  ["imps", "Impressions"],
];

function videoSortValue(m, key) {
  const v = m[key];
  return v == null || Number.isNaN(v) ? -Infinity : v;
}

function videoSortText(m, key) {
  if (key === "spend") return usd(m.spend);
  if (["hook", "hold", "complete", "ctr", "linkCtr", "engRate"].includes(key)) {
    const v = m[key];
    return v == null ? "—" : pct(v);
  }
  return num(m[key] || 0);
}

function videoRateCount(m, key) {
  if (key === "hook") return `${num(m.p25)} watched 25% / ${num(m.imps)} impr`;
  if (key === "linkCtr") return `${num(m.link)} link click${m.link === 1 ? "" : "s"} / ${num(m.imps)} impr`;
  if (key === "ctr") return `${num(m.clicks)} clicks / ${num(m.imps)} impr`;
  if (key === "hold") return `${num(m.p25)} watched 25% / ${num(m.plays)} plays`;
  if (key === "complete") return `${num(m.p100)} finished / ${num(m.plays)} plays`;
  if (key === "engRate") return `${num(m.eng)} eng / ${num(m.imps)} impr`;
  return "";
}

function videoRowMeta(m, key) {
  const parts = [];
  if (key !== "hook") parts.push(m.hook == null ? "— hook" : `${pct(m.hook)} hook · ${num(m.p25)} of ${num(m.imps)}`);
  if (key !== "linkCtr" && key !== "ctr") parts.push(`${pct(m.linkCtr)} link CTR · ${num(m.link)} of ${num(m.imps)}`);
  if (key !== "engRate") parts.push(`${pct(m.engRate)} eng`);
  if (key !== "purch") parts.push(m.purch ? `${num(m.purch)} purch` : "0 purch");
  return parts.slice(0, 3).join(" · ");
}

function pageVideo() {
  const lane = state.videoLane || "all";
  const sortKey = state.videoSort || "hook";
  const sortLabel = (VIDEO_SORTS.find(([id]) => id === sortKey) || ["hook", "Hook rate"])[1];
  const laneChips = `
    <div class="sort-row">
      ${[
        ["all", "All"],
        ["m1", "Month 1"],
        ["m2", "Month 2"],
        ["rtg", "Retargeting"],
      ].map(([id, label]) => `<button class="chip ${lane === id ? "active" : ""}" data-vlane="${id}">${label}</button>`).join("")}
    </div>`;
  let vids;
  if (lane === "all") {
    vids = adsWithSpend().filter((x) => x.ad.isVideo && x.m.plays > 0);
  } else {
    vids = DATA.ads
      .filter((ad) => ad.isVideo && videoBucket(ad) === lane)
      .map((ad) => ({ ad, m: sumMetrics(ad.daily || []) }))
      .filter((x) => x.m.plays > 0 || x.m.spend > 0);
  }
  vids.sort((a, b) => videoSortValue(b.m, sortKey) - videoSortValue(a.m, sortKey) || (b.m.spend || 0) - (a.m.spend || 0));
  const rangeNote = lane === "all" ? fmtRange(...currentRange()) : "since each video launched";
  const head = `
    <div class="caption">03 / Video creative analysis</div>
    <h1>Which videos held attention, and which ones got the click.</h1>
    <p class="lede">Hook rate is people who watched 25% of the video, divided by impressions. Completion is people who watched it through, divided by plays.</p>
    ${laneChips}`;
  if (!vids.length) return `${head}<p class="lede">No video delivery in this cut.</p>`;
  const bestTraffic = [...vids].sort((a, b) => b.m.link - a.m.link)[0];
  const bestEng = [...vids].sort((a, b) => b.m.engRate - a.m.engRate)[0];
  const bestHook = [...vids].sort((a, b) => (b.m.hook || 0) - (a.m.hook || 0))[0];
  const maxBar = Math.max(...vids.map((v) => Math.max(0, v.m[sortKey] || 0)), 1);
  const tot = sumMetrics(vids.flatMap((v) => (lane === "all" ? rowsBetween(v.ad.daily) : (v.ad.daily || []))));
  return `
    ${head}
    <div class="kpi-row">
      <div class="kpi"><div class="v">${tot.hook == null ? "—" : pct(tot.hook)}</div><div class="l">Hook rate</div></div>
      <div class="kpi"><div class="v">${tot.hold == null ? "—" : pct(tot.hold)}</div><div class="l">25% retained</div></div>
      <div class="kpi"><div class="v">${tot.complete == null ? "—" : pct(tot.complete)}</div><div class="l">Completion</div></div>
      <div class="kpi"><div class="v">${pct(tot.linkCtr)}</div><div class="l">Link CTR</div></div>
    </div>
    <div class="signal-grid">
      <div class="signal"><div class="k">Best traffic video</div><h3>${bestTraffic.ad.concept} ${bestTraffic.ad.variant}</h3><p>${pct(bestTraffic.m.linkCtr)} link CTR · ${num(bestTraffic.m.link)} link clicks · ${num(bestTraffic.m.imps)} impressions</p></div>
      <div class="signal"><div class="k">Best engagement video</div><h3>${bestEng.ad.concept} ${bestEng.ad.variant}</h3><p>${pct(bestEng.m.engRate)} engagement · ${num(bestEng.m.eng)} engagements</p></div>
      <div class="signal"><div class="k">Highest hook rate</div><h3>${bestHook.ad.concept} ${bestHook.ad.variant}</h3><p>${bestHook.m.hook == null ? "—" : pct(bestHook.m.hook)} hook · ${num(bestHook.m.imps)} impressions</p></div>
    </div>
    <h2>One-glance creative comparison</h2>
    <div class="sort-row">
      <span class="sort-label">Sort by</span>
      ${VIDEO_SORTS.map(([id, label]) => `<button class="chip ${sortKey === id ? "active" : ""}" data-vsort="${id}">${label}</button>`).join("")}
    </div>
    <p class="caption">Sorted by ${sortLabel.toLowerCase()} · ${rangeNote} · ${vids.length} videos</p>
    <div class="bars">
      ${vids.map((x, i) => `
        <div class="bar-row" data-ad="${x.ad.id}" style="cursor:pointer">
          ${thumbEl(x.ad, 52)}
          <div>
            <div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;margin-bottom:4px">
              <span><strong style="color:var(--gold);margin-right:8px">${String(i + 1).padStart(2, "0")}</strong>${x.ad.concept} ${x.ad.variant} · ${x.ad.format}</span>
              <span><strong>${videoSortText(x.m, sortKey)}</strong> ${sortLabel.toLowerCase()}${videoRateCount(x.m, sortKey) ? " · " + videoRateCount(x.m, sortKey) : ""}${videoRowMeta(x.m, sortKey) ? " · " + videoRowMeta(x.m, sortKey) : ""}</span>
            </div>
            <div class="bar-stack">
              <span class="seg-hook" style="width:${Math.max(2, (100 * Math.max(0, x.m[sortKey] || 0)) / maxBar)}%"></span>
            </div>
          </div>
        </div>`).join("")}
    </div>
  `;
}

function pageEngagement() {
  const list = adsWithSpend().filter((x) => x.m.react + x.m.comment + x.m.share + x.m.save > 0)
    .sort((a, b) => (b.m.react + b.m.comment) - (a.m.react + a.m.comment));
  const tot = sumMetrics(list.flatMap((x) => rowsBetween(x.ad.daily)));
  const acc = windowMetrics();
  return `
    <h1>Engagement & comments</h1>
    <p class="lede">On-ad social proof in the selected window, plus Instagram profile visits and new followers from the same ads window.</p>
    <div class="kpi-row six">
      <div class="kpi"><div class="v">${num(tot.react)}</div><div class="l">Reactions</div></div>
      <div class="kpi"><div class="v">${num(tot.comment)}</div><div class="l">Comments</div></div>
      <div class="kpi"><div class="v">${num(tot.share)}</div><div class="l">Shares</div></div>
      <div class="kpi"><div class="v">${num(tot.save)}</div><div class="l">Saves</div></div>
      <div class="kpi ${acc.igProfile ? "" : "muted"}"><div class="v">${acc.igProfile ? num(acc.igProfile) : "—"}</div><div class="l">Profile visits</div></div>
      <div class="kpi ${acc.igFollow ? "" : "muted"}"><div class="v">${acc.igFollow ? num(acc.igFollow) : "—"}</div><div class="l">Profile followers</div></div>
    </div>
    <p class="caption">${fmtRange(...currentRange())} · profile visits and followers are account-level for this window. ${DATA.meta.igNote || "These purchase campaigns do not report Instagram profile actions."}</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Creative</th><th class="num">Reactions</th><th class="num">Comments</th>
          <th class="num">Shares</th><th class="num">Saves</th><th class="num">Engagement rate</th>
        </tr></thead>
        <tbody>
          ${list.map((x) => `
            <tr data-ad="${x.ad.id}">
              <td><div class="ad-cell">${thumbEl(x.ad)}<div><div class="name">${x.ad.concept} ${x.ad.variant}</div><div class="sub">${x.ad.format}</div></div></div></td>
              <td class="num">${num(x.m.react)}</td>
              <td class="num">${num(x.m.comment)}</td>
              <td class="num">${num(x.m.share)}</td>
              <td class="num">${num(x.m.save)}</td>
              <td class="num">${pct(x.m.engRate)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function pageGoogle() {
  const g = DATA.google;
  if (!g) return `<h1>Google Ads</h1><p class="lede">No Google snapshot in this file yet.</p>`;
  const weekLabel = "1 Oct – 7 Oct";
  const campaigns = [
    {
      name: "BOW | PMax | US | Retail test | $30",
      type: "Performance Max",
      budget: "$20 a day",
      spend: 56.14,
      imps: 505,
      clicks: 57,
      ctr: 11.29,
      cpc: 0.98,
      purch: 1,
    },
    {
      name: "BOW | Shopping | US | All Products | $30",
      type: "Shopping",
      budget: "$10 a day",
      spend: 50.66,
      imps: 1067,
      clicks: 13,
      ctr: 1.22,
      cpc: 3.90,
      purch: 0,
    },
  ];
  const products = (g.products || []).filter((p) => p.imps || p.spend).sort((a, b) => b.spend - a.spend);
  const terms = [
    { term: "que vitamina es buena para la piel reseca", imps: 1, clicks: 1, spend: 6.55 },
    { term: "absorption", imps: 1, clicks: 1, spend: 5.55 },
    { term: "suplementos para adultos mayores de 70 años", imps: 1, clicks: 1, spend: 3.19 },
    { term: "omega xl", imps: 26, clicks: 1, spend: 2.84 },
    { term: "vitalhealth en español", imps: 1, clicks: 1, spend: 2.54 },
    { term: "three vitamins", imps: 2, clicks: 1, spend: 2.54 },
  ];
  const storeOrders = [
    { when: "Sun 4 Oct", kind: "Paid", note: "Performance Max. This is the order Google Ads has.", paid: "$40" },
    { when: "This week", kind: "Paid", note: "Saw a Meta ad, then searched. Google Ads does not have this order.", paid: "—" },
    { when: "This week", kind: "Organic", note: "Saw a Meta ad, then searched.", paid: "—" },
    { when: "This week", kind: "Organic", note: "Saw a Meta ad, then searched.", paid: "—" },
  ];
  const actions = [
    ["Performance Max", "Page view", 133, "—"],
    ["Performance Max", "View item", 61, "—"],
    ["Performance Max", "Add to cart", 8, "—"],
    ["Performance Max", "Checkout started", 7, "—"],
    ["Performance Max", "Purchase", 1, "$40"],
    ["Shopping", "Page view", 15, "—"],
    ["Shopping", "View item", 12, "—"],
  ];
  return `
    <div class="hero">
      <div>
        <div class="caption" style="color:#9bb0aa">04 / Google Ads</div>
        <h1>Last 7 days</h1>
        <ul>
          <li>Google Ads spent ${usd(106.80)}. Performance Max ${usd(56.14)}, Shopping ${usd(50.66)}.</li>
          <li>Four orders touched Google. Two were paid. Two were an organic search.</li>
          <li>Each of those four had seen a Meta ad and then searched. The same order can sit on both.</li>
          <li>Google Ads has one of the paid orders: Sunday 4 Oct, ${usd(40, 0)}, on Performance Max. Shopping did not purchase.</li>
        </ul>
      </div>
      <div class="when">Last 7 days
        <b>${weekLabel}</b>
        Pulled the morning of 8 Oct
      </div>
    </div>
    <div class="score-grid">
      <div class="score"><div class="v">${usd(106.80, 0)}</div><div class="l">Google Ads spend</div><div class="h">${weekLabel}</div></div>
      <div class="score"><div class="v">${num(1572)}</div><div class="l">Impressions</div><div class="h">${usd(67.94)} CPM</div></div>
      <div class="score"><div class="v">${num(70)}</div><div class="l">Clicks</div><div class="h">4.45% CTR · ${usd(1.53)} CPC</div></div>
      <div class="score"><div class="v">4</div><div class="l">Orders that touched Google</div><div class="h">2 paid · 2 organic</div></div>
    </div>
    <div class="insight">
      <div class="k">The same orders, two places</div>
      <h3>They saw the ad, then they searched.</h3>
      <ul>
        <li>Two orders came through paid Google. Two came through organic search.</li>
        <li>All four had already seen a Meta ad. Meta can count the order, and Google can count the search.</li>
        <li>Google Ads itself only has Sunday’s ${usd(40, 0)} order. The other paid order and both organic orders are not in that count.</li>
      </ul>
    </div>
    <h2>Orders that touched Google</h2>
    <p class="caption">Four orders. Two paid, two organic. Dates and amounts for three of them are not in Google Ads. ${weekLabel}.</p>
    <div class="table-wrap">
      <table class="plain">
        <thead><tr>
          <th>When</th><th>Kind</th><th class="num">Paid</th><th>Where it sits</th>
        </tr></thead>
        <tbody>
          ${storeOrders.map((o) => `
            <tr>
              <td>${o.when}</td>
              <td>${o.kind}</td>
              <td class="num">${o.paid}</td>
              <td>${o.note}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <h2>Campaigns</h2>
    <p class="caption">${weekLabel} · Google Ads has one purchase, on Performance Max · budgets are $20 and $10 a day</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Campaign</th><th>Type</th><th>Status</th>
          <th class="num">Spend</th><th class="num">Impr.</th><th class="num">Clicks</th>
          <th class="num">CTR</th><th class="num">CPC</th><th class="num">Purchases</th>
        </tr></thead>
        <tbody>
          ${campaigns.map((c) => `
            <tr>
              <td><div class="name">${c.name}</div><div class="sub">Budget ${c.budget}</div></td>
              <td>${c.type}</td>
              <td><span class="status ${c.purch ? "promising" : "mixed"}">${c.purch ? "Converted" : "In market"}</span></td>
              <td class="num">${usd(c.spend)}</td>
              <td class="num">${num(c.imps)}</td>
              <td class="num">${num(c.clicks)}</td>
              <td class="num">${pct(c.ctr)}</td>
              <td class="num">${usd(c.cpc)}</td>
              <td class="num">${c.purch ? num(c.purch) : "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <h2>Products</h2>
    <p class="caption">Since Google launched 11 Sep. These product totals are outside the last 7 days.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Product</th><th class="num">Spend</th><th class="num">Impr.</th>
          <th class="num">Clicks</th><th class="num">Purchases</th><th class="num">Revenue</th>
        </tr></thead>
        <tbody>
          ${products.map((p) => `
            <tr>
              <td><div class="name">${p.title}</div><div class="sub">${p.brand}</div></td>
              <td class="num">${usd(p.spend)}</td>
              <td class="num">${num(p.imps)}</td>
              <td class="num">${num(p.clicks)}</td>
              <td class="num">${p.purch ? num(p.purch) : "—"}</td>
              <td class="num">${p.rev ? usd(p.rev) : "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <h2>Search terms</h2>
    <p class="caption">${weekLabel} · Shopping queries that spent · none of these purchased</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Query</th><th class="num">Impr.</th><th class="num">Clicks</th>
          <th class="num">Spend</th><th class="num">Purchases</th>
        </tr></thead>
        <tbody>
          ${terms.map((t) => `
            <tr>
              <td>${t.term}</td>
              <td class="num">${num(t.imps)}</td>
              <td class="num">${num(t.clicks)}</td>
              <td class="num">${usd(t.spend)}</td>
              <td class="num">—</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <h2>On-site actions</h2>
    <p class="caption">${weekLabel} · Google Shopping App tags · the purchase is the Sunday order</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Campaign</th><th>Action</th><th class="num">Count</th><th class="num">Value</th>
        </tr></thead>
        <tbody>
          ${actions.map(([campaign, action, count, value]) => `
            <tr>
              <td>${campaign}</td>
              <td>${action}</td>
              <td class="num">${num(count)}</td>
              <td class="num">${value}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="caption">Last 7 days, ${weekLabel}. Shopping and Performance Max. Display is off this page.</p>
  `;
}

function pageSite() {
  const month = state.siteMonth || "oct";
  return `
    <div class="sort-row">
      <button class="chip ${month === "sep" ? "active" : ""}" data-smonth="sep">September</button>
      <button class="chip ${month === "oct" ? "active" : ""}" data-smonth="oct">October</button>
    </div>
    ${month === "sep" ? pageSiteSeptember() : pageSiteOctober()}
  `;
}

function pageSiteSeptember() {
  const purchases = [
    ["Direct", "Phone", 7, 99.55],
    ["Instagram, not an ad click", "Phone", 3, 74],
    ["Facebook ad", "Phone", 2, 48.55],
    ["Performance Max", "Computer", 2, 29],
    ["Not tagged", "Phone", 2, 74],
    ["Performance Max", "Phone", 1, 34],
    ["Google search", "Phone", 1, 49.30],
    ["Google Shopping", "Phone", 1, 40],
    ["ELLE", "Phone", 1, 24.65],
    ["Instagram, not an ad click", "Tablet", 1, 19.55],
    ["Direct", "Computer", 1, 0],
  ];
  const landings = [
    ["/products/multivitamin", "1,786", "29%", "71%", "29", "6"],
    ["Homepage", "160", "61%", "39%", "15", "8"],
    ["No page stored", "94", "0%", "100%", "8", "—"],
    ["/products/tote-bag", "68", "44%", "56%", "—", "—"],
    ["/products/crop-tee", "43", "14%", "86%", "—", "—"],
    ["/collections/all-products", "16", "38%", "63%", "1", "1"],
  ];
  const browsers = [
    ["Safari", "1,431", "29%", "41", "14", "1 min"],
    ["Instagram in-app browser", "326", "40%", "1", "1", "3 min 34 sec"],
    ["Chrome", "292", "24%", "11", "2", "56 sec"],
    ["Android in-app browser", "102", "41%", "3", "1", "1 min 29 sec"],
    ["Samsung Internet", "14", "21%", "1", "—", "57 sec"],
  ];
  return `
    <div class="hero">
      <div>
        <div class="caption" style="color:#9bb0aa">05 / Website</div>
        <h1>September on the site</h1>
        <ul>
          <li>2,854 sessions. 2,169 of them were on a phone.</li>
          <li>22 purchases. 18 were on a phone, worth $493.</li>
          <li>The multivitamin page took 1,786 mobile sessions and 6 purchases. The homepage took 160 mobile sessions and 8. Those homepage buyers already knew the brand.</li>
          <li>Meta counted 38 add to carts and 95 checkouts. On the site it is the other way around: 76 adds and 38 checkouts.</li>
        </ul>
      </div>
      <div class="when">September
        <b>1 Sep – 30 Sep</b>
        This page stays on September
      </div>
    </div>
    <div class="score-grid">
      <div class="score"><div class="v">${num(2854)}</div><div class="l">Sessions</div><div class="h">2,169 on a phone</div></div>
      <div class="score"><div class="v">22</div><div class="l">Purchases</div><div class="h">18 on a phone · ${usd(492.60, 0)}</div></div>
      <div class="score"><div class="v">76</div><div class="l">Add to carts</div><div class="h">59 people</div></div>
      <div class="score"><div class="v">38</div><div class="l">Checkouts started</div><div class="h">32 people</div></div>
    </div>

    <h2>Phone and computer</h2>
    <p class="caption">Engaged means they stayed 10 seconds, clicked, or opened a second page. There is no 5-second or 15-second event. Scroll here means they reached 90% of a page.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Device</th><th class="num">Sessions</th><th class="num">Engaged</th><th class="num">Time on site</th>
          <th class="num">Reached 90%</th><th class="num">Add to cart</th><th class="num">Checkout</th><th class="num">Purchases</th>
        </tr></thead>
        <tbody>
          <tr><td>Phone</td><td class="num">2,169</td><td class="num">31%</td><td class="num">1 min 25 sec</td><td class="num">118</td><td class="num">57</td><td class="num">23</td><td class="num">18</td></tr>
          <tr><td>Computer</td><td class="num">625</td><td class="num">39%</td><td class="num">3 min 2 sec</td><td class="num">110</td><td class="num">15</td><td class="num">14</td><td class="num">3</td></tr>
          <tr><td>Tablet</td><td class="num">60</td><td class="num">20%</td><td class="num">1 min 43 sec</td><td class="num">—</td><td class="num">1</td><td class="num">—</td><td class="num">1</td></tr>
        </tbody>
      </table>
    </div>

    <h2>Where the 22 purchases started</h2>
    <p class="caption">The session’s first source. 18 of the 22 were on a phone.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Where they came from</th><th>Device</th><th class="num">Purchases</th><th class="num">Revenue</th>
        </tr></thead>
        <tbody>
          ${purchases.map(([from, device, n, rev]) => `
            <tr>
              <td>${from}</td>
              <td>${device}</td>
              <td class="num">${n}</td>
              <td class="num">${rev ? usd(rev) : "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>

    <h2>Where mobile sessions landed</h2>
    <p class="caption">Phone only. The ad click lands on the multivitamin page. The homepage rate is people who already arrived knowing the brand.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Landing page</th><th class="num">Sessions</th><th class="num">Engaged</th><th class="num">Left</th>
          <th class="num">Add to cart</th><th class="num">Purchases</th>
        </tr></thead>
        <tbody>
          ${landings.map((row) => `
            <tr>${row.map((cell, i) => `<td${i ? ` class="num"` : ""}>${cell}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>

    <h2>Browsers on a phone</h2>
    <p class="caption">Instagram’s in-app browser is where the ad click opens. 326 sessions, 1 add to cart, 1 purchase.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Browser</th><th class="num">Sessions</th><th class="num">Engaged</th>
          <th class="num">Add to cart</th><th class="num">Purchases</th><th class="num">Time on site</th>
        </tr></thead>
        <tbody>
          ${browsers.map((row) => `
            <tr>${row.map((cell, i) => `<td${i ? ` class="num"` : ""}>${cell}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>

    <h2>The phone screen</h2>
    <div class="insight wide">
      <div class="k">Multivitamin page, phone width</div>
      <h3>Buy Now is a full screen below the fold.</h3>
      <p>The first view is the header, one photo with the next photo peeking in, the title, 30 reviews, and the start of the description. Buy Now sits at about 1,560 pixels. The page is about 13,200 pixels, roughly 15 phone screens. 6% of phone visitors reached 90% of a page. 25% of computer visitors did.</p>
      <p>Before Buy Now, the page shows Subscribe at $40, then $20 a month, $23 for 30 days, and $29 one-time. The button itself still adds to cart. The label says Buy Now, and the form posts to the cart. It is not skipping the add.</p>
    </div>

    <h2>What to test</h2>
    <p class="caption">One test at a time, on the phone, on the multivitamin page. Split the page 50/50. Do not split the ad.</p>
    <div class="insight-grid">
      <div class="insight">
        <div class="k">Test 1 · run this</div>
        <h3>Sticky Buy Now</h3>
        <ul>
          <li>Once the photo scrolls away, a bar stays at the bottom with $20/month and Buy Now. It uses the 60-day subscribe option already selected.</li>
          <li>Win is the add-to-cart rate. Guardrail is the share of orders that stay on subscribe.</li>
          <li>About 60 mobile sessions a day, adding to cart at 1.6%. A lift toward 3% needs about four weeks. Do not read it before two.</li>
        </ul>
      </div>
      <div class="insight">
        <div class="k">Test 2 · after Test 1</div>
        <h3>One price above the button</h3>
        <ul>
          <li>$20/month, 2 bottles every 60 days, free shipping. One line for $29 once. Then Buy Now.</li>
          <li>The description, benefits, and ingredients move below the button.</li>
          <li>Same audience, same two reads: add to cart, and subscribe share.</li>
        </ul>
      </div>
      <div class="insight">
        <div class="k">Test 3 · watch, don’t split</div>
        <h3>Instagram’s browser</h3>
        <ul>
          <li>326 sessions in September is too small for its own test.</li>
          <li>On the winning page, if the browser is Instagram’s, make the button Shop Pay or Apple Pay, with a link that says open in Safari.</li>
          <li>A move off 1 add to cart in 326 sessions is the signal.</li>
        </ul>
      </div>
      <div class="insight">
        <div class="k">Leave this</div>
        <h3>Do not send the ads to the homepage</h3>
        <p>Eight purchases on 160 mobile sessions looks strong next to six on 1,786. Those homepage sessions are people who already knew where they were going.</p>
      </div>
    </div>

    <h2>Add to cart and checkout</h2>
    <p class="caption">The checkout page does not record which button was clicked. Shop Pay, PayPal, Apple Pay, card, Subscribe, and One-time are not stored. The only click events are people leaving for Instagram, TikTok, or YouTube.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>On the site, September</th><th class="num">Events</th><th class="num">People</th>
        </tr></thead>
        <tbody>
          <tr><td>Add to cart</td><td class="num">76</td><td class="num">59</td></tr>
          <tr><td>Checkout started</td><td class="num">38</td><td class="num">32</td></tr>
          <tr><td>Shipping step</td><td class="num">38</td><td class="num">12</td></tr>
          <tr><td>Payment step</td><td class="num">10</td><td class="num">8</td></tr>
          <tr><td>Purchase</td><td class="num">22</td><td class="num">22</td></tr>
        </tbody>
      </table>
    </div>
    <p class="caption">74 of the 76 adds were on the multivitamin page. The shipping step fired 38 times from 12 people. One checkout hit that step 7 times.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>In Meta, September</th><th class="num">Add to cart</th><th class="num">Initiate checkout</th><th class="num">Purchase</th>
        </tr></thead>
        <tbody>
          <tr><td>Counted</td><td class="num">38</td><td class="num">95</td><td class="num">11</td></tr>
          <tr><td>Click within 7 days</td><td class="num">27</td><td class="num">62</td><td class="num">8</td></tr>
          <tr><td>Saw an ad, no click</td><td class="num">13</td><td class="num">36</td><td class="num">6</td></tr>
          <tr><td>Value attached</td><td class="num">${usd(929, 0)}</td><td class="num">${usd(499, 0)}</td><td class="num">${usd(225, 0)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="insight wide">
      <div class="k">Why Meta’s checkout is higher than its cart</div>
      <h3>The site is not upside down. Meta’s count is.</h3>
      <ul>
        <li>On the site, add to cart is about double checkout, and checkout is higher than purchases.</li>
        <li>Checkout fires again when someone reopens or refreshes it. Meta counts each one. The cart event fires once, on the product page.</li>
        <li>36 of the 95 checkouts are someone who saw an ad and did not click. The cart only picked up 13 that way.</li>
        <li>Those 95 checkouts are valued at $499, about $5 each. The 38 carts are valued at $929, about $24 each. A real checkout of this product is $23, $29, or $40.</li>
      </ul>
    </div>
    <p class="caption">September, 1 Sep – 30 Sep. Google Analytics for the site. Meta cart and checkout from Ads Manager. The date chips on the other pages do not change this one.</p>
  `;
}

function pageSiteOctober() {
  const purchases = [
    ["Direct", "Phone", 4, 110.65],
    ["Facebook ad", "Phone", 4, 83.30],
    ["Not tagged", "Computer", 2, 59.55],
    ["Google search", "Phone", 2, 74],
    ["Not tagged", "Phone", 1, 34],
    ["Facebook ad", "Computer", 1, 34],
    ["Performance Max", "Phone", 1, 40],
  ];
  const landings = [
    ["/products/multivitamin", "791", "27%", "73%", "21", "6"],
    ["No page stored", "100", "—", "100%", "—", "—"],
    ["Homepage", "58", "59%", "41%", "19", "3"],
    ["/collections/all-products", "18", "50%", "50%", "1", "—"],
    ["/pages/vitamins-101", "11", "45%", "55%", "1", "1"],
    ["/products/crop-tee", "9", "11%", "89%", "1", "—"],
  ];
  const browsers = [
    ["Safari", "703", "30%", "38", "9", "1 min 8 sec"],
    ["Chrome", "175", "19%", "4", "1", "1 min 10 sec"],
    ["Android in-app browser", "56", "50%", "3", "2", "1 min 27 sec"],
    ["Safari in-app", "15", "33%", "—", "—", "32 sec"],
  ];
  return `
    <div class="hero">
      <div>
        <div class="caption" style="color:#9bb0aa">05 / Website</div>
        <h1>October on the site</h1>
        <ul>
          <li>1,219 sessions. 956 of them were on a phone.</li>
          <li>15 purchases. 12 were on a phone. Together the 15 are worth ${usd(435.50)}.</li>
          <li>The multivitamin page took 791 mobile sessions and 6 purchases. The homepage took 58 mobile sessions and 3.</li>
          <li>Meta counted 38 add to carts and 76 checkouts. On the site it is 61 adds and 39 checkouts.</li>
        </ul>
      </div>
      <div class="when">October
        <b>1 Oct – 8 Oct</b>
        The 8th is this morning
      </div>
    </div>
    <div class="score-grid">
      <div class="score"><div class="v">${num(1219)}</div><div class="l">Sessions</div><div class="h">956 on a phone</div></div>
      <div class="score"><div class="v">15</div><div class="l">Purchases</div><div class="h">12 on a phone · ${usd(435.50, 0)}</div></div>
      <div class="score"><div class="v">61</div><div class="l">Add to carts</div><div class="h">43 people</div></div>
      <div class="score"><div class="v">39</div><div class="l">Checkouts started</div><div class="h">23 people</div></div>
    </div>

    <h2>Phone and computer</h2>
    <p class="caption">Engaged means they stayed 10 seconds, clicked, or opened a second page. There is no 5-second or 15-second event. Scroll here means they reached 90% of a page.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Device</th><th class="num">Sessions</th><th class="num">Engaged</th><th class="num">Time on site</th>
          <th class="num">Reached 90%</th><th class="num">Add to cart</th><th class="num">Checkout</th><th class="num">Purchases</th>
        </tr></thead>
        <tbody>
          <tr><td>Phone</td><td class="num">956</td><td class="num">29%</td><td class="num">1 min 9 sec</td><td class="num">78</td><td class="num">45</td><td class="num">26</td><td class="num">12</td></tr>
          <tr><td>Computer</td><td class="num">254</td><td class="num">33%</td><td class="num">4 min 32 sec</td><td class="num">99</td><td class="num">16</td><td class="num">13</td><td class="num">3</td></tr>
          <tr><td>Tablet</td><td class="num">9</td><td class="num">—</td><td class="num">6 sec</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>
        </tbody>
      </table>
    </div>

    <h2>Where the 15 purchases started</h2>
    <p class="caption">The session’s first source. 12 of the 15 were on a phone. Google search is organic. The paid Google order is Performance Max.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Where they came from</th><th>Device</th><th class="num">Purchases</th><th class="num">Revenue</th>
        </tr></thead>
        <tbody>
          ${purchases.map(([from, device, n, rev]) => `
            <tr>
              <td>${from}</td>
              <td>${device}</td>
              <td class="num">${n}</td>
              <td class="num">${usd(rev)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>

    <h2>Where mobile sessions landed</h2>
    <p class="caption">Phone only. The ad click lands on the multivitamin page.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Landing page</th><th class="num">Sessions</th><th class="num">Engaged</th><th class="num">Left</th>
          <th class="num">Add to cart</th><th class="num">Purchases</th>
        </tr></thead>
        <tbody>
          ${landings.map((row) => `
            <tr>${row.map((cell, i) => `<td${i ? ` class="num"` : ""}>${cell}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>

    <h2>Browsers on a phone</h2>
    <p class="caption">Safari in-app is 15 sessions and did not add to cart. Android’s in-app browser had 2 of the phone purchases.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Browser</th><th class="num">Sessions</th><th class="num">Engaged</th>
          <th class="num">Add to cart</th><th class="num">Purchases</th><th class="num">Time on site</th>
        </tr></thead>
        <tbody>
          ${browsers.map((row) => `
            <tr>${row.map((cell, i) => `<td${i ? ` class="num"` : ""}>${cell}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>

    <h2>The phone screen</h2>
    <div class="insight wide">
      <div class="k">Multivitamin page, phone width</div>
      <h3>Buy Now is a full screen below the fold.</h3>
      <p>The first view is the header, one photo with the next photo peeking in, the title, 30 reviews, and the start of the description. Buy Now sits at about 1,560 pixels. The page is about 13,200 pixels, roughly 15 phone screens. 8% of phone sessions reached 90% of a page. 39% of computer sessions did.</p>
      <p>Before Buy Now, the page shows Subscribe at $40, then $20 a month, $23 for 30 days, and $29 one-time. The button itself still adds to cart. The label says Buy Now, and the form posts to the cart. It is not skipping the add.</p>
    </div>

    <h2>What to test</h2>
    <p class="caption">One test at a time, on the phone, on the multivitamin page. Split the page 50/50. Do not split the ad.</p>
    <div class="insight-grid">
      <div class="insight">
        <div class="k">Test 1 · run this</div>
        <h3>Sticky Buy Now</h3>
        <ul>
          <li>Once the photo scrolls away, a bar stays at the bottom with $20/month and Buy Now. It uses the 60-day subscribe option already selected.</li>
          <li>Win is the add-to-cart rate. Guardrail is the share of orders that stay on subscribe.</li>
          <li>About 130 phone sessions a day. They add to cart on about 5% of those sessions. Read it after two weeks.</li>
        </ul>
      </div>
      <div class="insight">
        <div class="k">Test 2 · after Test 1</div>
        <h3>One price above the button</h3>
        <ul>
          <li>$20/month, 2 bottles every 60 days, free shipping. One line for $29 once. Then Buy Now.</li>
          <li>The description, benefits, and ingredients move below the button.</li>
          <li>Same audience, same two reads: add to cart, and subscribe share.</li>
        </ul>
      </div>
      <div class="insight">
        <div class="k">Test 3 · watch, don’t split</div>
        <h3>The in-app browser</h3>
        <ul>
          <li>Safari in-app is 15 phone sessions this month. None of them added to cart.</li>
          <li>That is too small for its own test. On the winning page, if the browser is in-app, make the button Shop Pay or Apple Pay, with a link that says open in Safari.</li>
        </ul>
      </div>
      <div class="insight">
        <div class="k">Leave this</div>
        <h3>Do not send the ads to the homepage</h3>
        <p>Three purchases on 58 mobile sessions sits next to six on 791. The ad click already lands on the multivitamin page. Leave it there.</p>
      </div>
    </div>

    <h2>Add to cart and checkout</h2>
    <p class="caption">The checkout page does not record which button was clicked. Shop Pay, PayPal, Apple Pay, card, Subscribe, and One-time are not stored.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>On the site, October</th><th class="num">Events</th><th class="num">People</th>
        </tr></thead>
        <tbody>
          <tr><td>Add to cart</td><td class="num">61</td><td class="num">43</td></tr>
          <tr><td>Checkout started</td><td class="num">39</td><td class="num">23</td></tr>
          <tr><td>Shipping step</td><td class="num">22</td><td class="num">8</td></tr>
          <tr><td>Payment step</td><td class="num">5</td><td class="num">5</td></tr>
          <tr><td>Purchase</td><td class="num">15</td><td class="num">15</td></tr>
        </tbody>
      </table>
    </div>
    <p class="caption">All 61 adds were on the multivitamin page. The shipping step fired 22 times from 8 people. One checkout hit that step 7 times.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>In Meta, 1 Oct – 8 Oct</th><th class="num">Add to cart</th><th class="num">Initiate checkout</th><th class="num">Purchase</th>
        </tr></thead>
        <tbody>
          <tr><td>Counted</td><td class="num">38</td><td class="num">76</td><td class="num">15</td></tr>
          <tr><td>Click within 7 days</td><td class="num">28</td><td class="num">61</td><td class="num">11</td></tr>
          <tr><td>Saw an ad, no click</td><td class="num">13</td><td class="num">16</td><td class="num">4</td></tr>
          <tr><td>Value attached</td><td class="num">${usd(960, 0)}</td><td class="num">${usd(357, 0)}</td><td class="num">${usd(326.50)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="insight wide">
      <div class="k">Why Meta’s checkout is higher than its cart</div>
      <h3>The site is not upside down. Meta’s count is.</h3>
      <ul>
        <li>On the site, add to cart is higher than checkout, and checkout is higher than purchases.</li>
        <li>Checkout fires again when someone reopens or refreshes it. Meta counts each one. The cart event fires once, on the product page.</li>
        <li>16 of the 76 checkouts are someone who saw an ad and did not click. The cart picked up 13 that way.</li>
        <li>Those 76 checkouts are valued at ${usd(357, 0)}, about ${usd(5, 0)} each. The 38 carts are valued at ${usd(960, 0)}, about ${usd(25, 0)} each. A purchase on the site this month averaged ${usd(29, 0)}.</li>
      </ul>
    </div>
    <p class="caption">October, 1 Oct – 8 Oct. The 8th is this morning. Google Analytics for the site. Meta cart and checkout from Ads Manager. The date chips on the other pages do not change this one.</p>
  `;
}

function pageWeek() {
  const days = [
    ["Thu 1 Oct", 1297.62, 5, 131.75, 259.52],
    ["Fri 2 Oct", 551.18, 1, 24.65, 551.18],
    ["Sat 3 Oct", 420.73, 1, 23, 420.73],
    ["Sun 4 Oct", 451.36, 1, 19.55, 451.36],
    ["Mon 5 Oct", 199.60, 1, null, 199.60],
    ["Tue 6 Oct", 541.95, 3, 74, 180.65],
    ["Wed 7 Oct", 324.88, 2, 19.55, 162.44],
  ];
  const campaigns = [
    ["Whole Self scale", 1603.23, 9, 204.95],
    ["Concept testing", 806.41, 3, 53.55],
    ["Wave 4", 336.66, 2, 34],
    ["Wave 3", 278.35, 0, null],
    ["Wave 2", 134.33, 0, null],
    ["Founder Instagram traffic", 126.03, 0, null],
    ["Julia Instagram visitors", 122.43, 0, null],
    ["Science 3.1", 104.69, 0, null],
    ["Best of", 102.68, 0, null],
    ["UGC cold", 78.49, 0, null],
    ["Website visitors", 67.54, 0, null],
    ["Older retargeting", 26.48, 0, null],
  ];
  const money = (n) => n == null ? "—" : usd(n);
  return `
    <div class="hero">
      <div>
        <div class="caption" style="color:#9bb0aa">01 / Last 7 days</div>
        <h1>1 Oct – 7 Oct</h1>
        <ul>
          <li>Meta spent ${usd(3787.32)} and counted 14 purchases, worth ${usd(292.50)}. That is about ${usd(270.52)} a purchase.</li>
          <li>Thursday was the heavy day: ${usd(1297.62)} and 5 purchases. Friday through Sunday settled to one purchase a day.</li>
          <li>12 of the 14 purchases are Whole Self 5.3. Nine are on the scale campaign. Three are the same ad still spending inside Concept testing.</li>
          <li>Google Ads spent ${usd(106.80)}. Performance Max had one ${usd(40, 0)} order on Sunday. Shopping spent ${usd(50.66)} and did not purchase.</li>
          <li>Four orders touched Google. Two were paid, two were organic search. Each person had seen a Meta ad and then searched. Google Ads only has the Sunday order.</li>
        </ul>
      </div>
      <div class="when">Last 7 days
        <b>1 Oct – 7 Oct</b>
        Week is closed
      </div>
    </div>
    <div class="score-grid">
      <div class="score"><div class="v">${usd(3787, 0)}</div><div class="l">Meta spend</div><div class="h">${usd(106.80)} on Google</div></div>
      <div class="score"><div class="v">14</div><div class="l">Meta purchases</div><div class="h">${usd(292.50)} purchase value</div></div>
      <div class="score"><div class="v">${usd(271, 0)}</div><div class="l">Meta cost per purchase</div><div class="h">12 of 14 are Whole Self</div></div>
      <div class="score"><div class="v">${usd(300, 0)}</div><div class="l">Meta budget now</div><div class="h">Set this evening</div></div>
    </div>

    <h2>Each day on Meta</h2>
    <p class="caption">Purchase value is what Meta attached to the purchase. Monday’s purchase has no value on it. Wednesday is through this evening, not a full day.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Day</th><th class="num">Spend</th><th class="num">Purchases</th><th class="num">Purchase value</th><th class="num">Cost per purchase</th>
        </tr></thead>
        <tbody>
          ${days.map(([day, spend, purch, value, cpa]) => `
            <tr>
              <td>${day}</td>
              <td class="num">${usd(spend)}</td>
              <td class="num">${purch}</td>
              <td class="num">${money(value)}</td>
              <td class="num">${usd(cpa)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>

    <h2>Where the Meta money went</h2>
    <p class="caption">1 Oct – 7 Oct. Campaign spend adds up to ${usd(3787.32)}.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Campaign</th><th class="num">Spend</th><th class="num">Purchases</th><th class="num">Purchase value</th>
        </tr></thead>
        <tbody>
          ${campaigns.map(([name, spend, purch, value]) => `
            <tr>
              <td>${name}</td>
              <td class="num">${usd(spend)}</td>
              <td class="num">${purch || "—"}</td>
              <td class="num">${money(value)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>

    <div class="insight wide">
      <div class="k">The purchases</div>
      <h3>Whole Self did the buying. The new test picked up two.</h3>
      <ul>
        <li>Whole Self 5.3 on the scale campaign: ${usd(1603.23)}, 9 purchases, ${usd(204.95)}. About ${usd(178)} each.</li>
        <li>The same Whole Self 5.3 inside Concept testing: ${usd(787.93)}, 3 purchases, ${usd(53.55)}. About ${usd(263)} each. Beauty Bestie 1.1 in that campaign spent ${usd(18.48)} and did not purchase.</li>
        <li>Wave 4 Whole Self vitamins: 1 purchase, ${usd(34)}. Founder 2.5: 1 purchase, and Meta attached no value to it. UGC 1.5, Science 3.5, and Beauty Bestie 4.5 spent and did not purchase. Wave 4 in total is ${usd(336.66)}.</li>
        <li>Best of, Science 3.1, both Instagram campaigns, Wave 2, and Wave 3 spent and did not purchase this week.</li>
      </ul>
    </div>

    <h2>Google</h2>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Campaign</th><th class="num">Spend</th><th class="num">Orders</th><th class="num">Order value</th>
        </tr></thead>
        <tbody>
          <tr><td>Performance Max</td><td class="num">${usd(56.14)}</td><td class="num">1</td><td class="num">${usd(40, 0)}</td></tr>
          <tr><td>Shopping</td><td class="num">${usd(50.66)}</td><td class="num">—</td><td class="num">—</td></tr>
        </tbody>
      </table>
    </div>
    <p class="caption">Google Ads has one order, Sunday 4 Oct, on Performance Max. Four orders touched Google in the same week: two paid, two organic. Each person had seen a Meta ad and then searched. Shopping spent every day and did not purchase.</p>

    <div class="insight">
      <div class="k">Where the budget sits tonight</div>
      <h3>Meta is capped at $300 a day.</h3>
      <ul>
        <li>Whole Self Optimizer, ${usd(140, 0)}. Wave 4, ${usd(30, 0)} each, ${usd(150, 0)} together. Website visitors, ${usd(10, 0)}.</li>
        <li>Instagram visitors, Founder profile traffic, Science 3.1, and Best of are off.</li>
        <li>Google is unchanged. Performance Max is ${usd(20, 0)} a day. Shopping is ${usd(10, 0)}.</li>
      </ul>
    </div>
    <p class="caption">1 Oct – 7 Oct. Meta through the evening of 7 Oct. Google refreshed the morning of 8 Oct. The date chips on the other pages do not change this one.</p>
  `;
}

let WAVES = null;
let WAVE_PREVIEWS = {};
let WAVE_MEDIA = {};

function findWaveAd(id) {
  if (!WAVES) return null;
  for (const wave of WAVES.waves) {
    const ad = wave.ads.find((a) => a.id === id);
    if (ad) return Object.assign({}, ad, { wave: wave.title });
  }
  return null;
}

function rate(part, whole) {
  if (!(part > 0) || !(whole > 0)) return null;
  return (100 * part) / whole;
}

function waveFacts(ad) {
  const facts = [];
  const add = (label, text) => facts.push([label, text]);
  if (ad.spend > 0) add("Spend", usd(ad.spend));
  if (ad.imps > 0) add("Impressions", num(ad.imps));
  const ctr = rate(ad.link, ad.imps);
  if (ctr != null) add("Link CTR", `${ctr.toFixed(2)}%`);
  if (ad.link > 0) add("Link clicks", num(ad.link));
  if (ad.atc > 0) add("Add to cart", num(ad.atc));
  if (ad.ic > 0) add("Checkout", num(ad.ic));
  if (ad.purch > 0) add("Purchases", num(ad.purch));
  if (ad.value > 0) add("Purchase value", usd(ad.value));
  if (ad.purch > 0 && ad.spend > 0) add("Cost per purchase", usd(ad.spend / ad.purch));
  if (ad.video && ad.plays > 0) add("Plays", num(ad.plays));
  const hook = ad.video ? rate(ad.p25, ad.imps) : null;
  if (hook != null) add("Hook", `${hook.toFixed(1)}%`);
  const done = ad.video ? rate(ad.p100, ad.plays) : null;
  if (done != null) add("Completed", `${done.toFixed(1)}%`);
  return facts;
}

function factHtml(facts) {
  return `<div class="fact-grid">${facts.map(([label, value]) => `<div><div class="v">${value}</div><div class="l">${label}</div></div>`).join("")}</div>`;
}

function wavePreview(ad) {
  const media = WAVE_MEDIA[ad.id];
  if (!media) return "";
  if (media.kind === "video") {
    return `<video class="media-video" src="${media.src}" controls playsinline preload="metadata"></video>`;
  }
  return (media.urls || []).map((url, i) => `<img class="media-still" src="${url}" alt="${ad.name}${media.urls.length > 1 ? " " + (i + 1) : ""}" />`).join("");
}

function statusClass(status) {
  if (status === "Live") return "promising";
  if (status === "Ad issue") return "mixed";
  return "thin";
}

function waveCard(ad) {
  const missingValue = ad.purch > 0 && !(ad.value > 0)
    ? `<p class="caption">Meta counted the purchase and did not attach a dollar value.</p>`
    : "";
  return `
    <article class="creative-card" data-ad="${ad.id}">
      <div class="creative-media">${wavePreview(ad)}</div>
      <div>
        <div class="card-kicker">
          <span class="status ${statusClass(ad.status)}">${ad.status}</span>
          <span class="caption">${ad.format}</span>
        </div>
        <h3>${ad.name}</h3>
        ${ad.title ? `<div class="card-title">${ad.title}</div>` : ""}
        <p class="copy">${ad.copy}</p>
        ${factHtml(waveFacts(ad))}
        ${missingValue}
      </div>
    </article>`;
}

function waveSum(ads, key) {
  return ads.reduce((n, ad) => n + (ad[key] || 0), 0);
}

function shownCount(n) {
  return n > 0 ? num(n) : "—";
}

function shownRate(part, whole) {
  const value = rate(part, whole);
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function waveTable(wave) {
  const rows = wave.ads.map((ad) => `
    <tr data-ad="${ad.id}" class="${state.selectedAd === ad.id ? "selected" : ""}">
      <td>
        <div class="name">${ad.name}</div>
        <div class="sub">${ad.format}</div>
      </td>
      <td class="num">${shownCount(ad.link)}</td>
      <td class="num">${shownCount(ad.atc)}</td>
      <td class="num">${shownCount(ad.ic)}</td>
      <td class="num">${shownCount(ad.purch)}</td>
      <td class="num">${ad.video ? shownRate(ad.p25, ad.imps) : "—"}</td>
      <td class="num">${ad.video ? shownRate(ad.p100, ad.plays) : "—"}</td>
      <td class="num">${ad.spend > 0 ? usd(ad.spend) : "—"}</td>
      <td><span class="status ${statusClass(ad.status)}">${ad.status}</span></td>
    </tr>`).join("");
  return `
    <h2>${wave.title}</h2>
    <p class="caption">${wave.note} Click a row to play it.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Creative</th>
          <th class="num">Link clicks</th>
          <th class="num">Add to cart</th>
          <th class="num">Checkout</th>
          <th class="num">Purchases</th>
          <th class="num">Hook</th>
          <th class="num">Completion</th>
          <th class="num">Spend</th>
          <th>Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function pageCreative() {
  if (!WAVES) return `<h1>Creative testing</h1><p class="lede">The wave pull is still loading.</p>`;
  const selected = state.testWave || "all";
  const chips = [
    ["all", "All waves"],
    ["w1", "Wave 1"],
    ["w2", "Wave 2"],
    ["w3", "Wave 3"],
    ["w4", "Wave 4"],
  ];
  const visible = selected === "all" ? WAVES.waves : WAVES.waves.filter((wave) => wave.id === selected);
  return `
    <h1>Creative testing</h1>
    <p class="lede">Filter by wave. Click a row and the ad opens beside the table, with the video and the rest of the numbers.</p>
    <div class="sort-row">
      ${chips.map(([id, label]) => `<button class="chip ${selected === id ? "active" : ""}" data-twave="${id}">${label}</button>`).join("")}
    </div>
    ${visible.map(waveTable).join("")}
    <p class="caption">25 Sep – 7 Oct. ${WAVES.source}</p>
  `;
}

function videoTable(wave) {
  const ads = wave.ads.filter((ad) => ad.video && ad.plays > 0);
  if (!ads.length) return "";
  const rows = ads.map((ad) => `
    <tr data-ad="${ad.id}" class="${state.selectedAd === ad.id ? "selected" : ""}">
      <td>
        <div class="name">${ad.name}</div>
        <div class="sub">${ad.format}</div>
      </td>
      <td class="num">${shownCount(ad.plays)}</td>
      <td class="num">${shownRate(ad.p25, ad.imps)}</td>
      <td class="num">${shownRate(ad.p100, ad.plays)}</td>
      <td class="num">${shownCount(ad.link)}</td>
      <td class="num">${shownCount(ad.purch)}</td>
      <td class="num">${ad.spend > 0 ? usd(ad.spend) : "—"}</td>
      <td><span class="status ${statusClass(ad.status)}">${ad.status}</span></td>
    </tr>`).join("");
  return `
    <h2>${wave.title}</h2>
    <p class="caption">${ads.length} videos. Hook is 25% of the video divided by impressions. Completed is the end divided by plays. Click a row to play it.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Creative</th>
          <th class="num">Plays</th>
          <th class="num">Hook</th>
          <th class="num">Completed</th>
          <th class="num">Link clicks</th>
          <th class="num">Purchases</th>
          <th class="num">Spend</th>
          <th>Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function pageRetention() {
  if (!WAVES) return `<h1>Video retention</h1><p class="lede">The wave pull is still loading.</p>`;
  const selected = state.videoWave || "all";
  const chips = [
    ["all", "All waves"],
    ["w1", "Wave 1"],
    ["w2", "Wave 2"],
    ["w3", "Wave 3"],
    ["w4", "Wave 4"],
  ];
  const visible = selected === "all" ? WAVES.waves : WAVES.waves.filter((wave) => wave.id === selected);
  return `
    <h1>Video retention</h1>
    <p class="lede">Filter by wave. Click a row and the video opens beside the table. Image and carousel ads stay on Creative testing.</p>
    <div class="sort-row">
      ${chips.map(([id, label]) => `<button class="chip ${selected === id ? "active" : ""}" data-vwave="${id}">${label}</button>`).join("")}
    </div>
    ${visible.map(videoTable).join("")}
    <p class="caption">25 Sep – 7 Oct. Meta video metrics. A cell stays blank when Meta did not return that number.</p>
  `;
}

function openWaveInspector(ad) {
  state.selectedAd = ad.id;
  document.querySelectorAll("#page tr[data-ad]").forEach((row) => {
    row.classList.toggle("selected", row.dataset.ad === ad.id);
  });
  $("inspector").classList.add("open");
  $("inspector").innerHTML = `
    <button class="close-x" id="closeIns">×</button>
    ${wavePreview(ad)}
    <h3>${ad.name}</h3>
    <div class="caption">${ad.wave || ""} · ${ad.format}</div>
    <span class="status ${statusClass(ad.status)}">${ad.status}</span>
    ${ad.title ? `<p style="font-size:14px;margin:12px 0 4px">${ad.title}</p>` : ""}
    <p class="copy">${ad.copy}</p>
    <div class="caption">From the same pull. A number only shows when Meta returned it.</div>
    ${factHtml(waveFacts(ad))}
    ${ad.purch > 0 && !(ad.value > 0) ? `<p class="caption">Meta counted the purchase and did not attach a dollar value.</p>` : ""}
  `;
  $("closeIns").onclick = () => {
    state.selectedAd = null;
    $("inspector").classList.remove("open");
    $("inspector").innerHTML = "";
  };
}

const PAGER = { story: pageStory, library: pageCreative, video: pageRetention, google: pageGoogle, site: pageSite, week: pageWeek };

function bindPageClicks() {
  $("page").onchange = (e) => {
    if (e.target.id === "libConcept") state.libConcept = e.target.value;
    if (e.target.id === "libFormat") state.libFormat = e.target.value;
    if (e.target.id === "libConcept" || e.target.id === "libFormat") render();
  };
  $("page").onclick = (e) => {
    const smonth = e.target.closest("[data-smonth]");
    if (smonth) {
      state.siteMonth = smonth.dataset.smonth;
      render();
      return;
    }
    const tmonth = e.target.closest("[data-tmonth]");
    if (tmonth) {
      state.testMonth = tmonth.dataset.tmonth;
      if (state.testMonth === "m1") state.testWave = "all";
      render();
      return;
    }
    const twave = e.target.closest("[data-twave]");
    if (twave) {
      state.testWave = twave.dataset.twave;
      render();
      return;
    }
    const vwave = e.target.closest("[data-vwave]");
    if (vwave) {
      state.videoWave = vwave.dataset.vwave;
      render();
      return;
    }
    const lsort = e.target.closest("[data-lsort]");
    if (lsort) {
      state.sort = lsort.dataset.lsort;
      render();
      return;
    }
    const vlane = e.target.closest("[data-vlane]");
    if (vlane) {
      state.videoLane = vlane.dataset.vlane;
      render();
      return;
    }
    const vsort = e.target.closest("[data-vsort]");
    if (vsort) {
      state.videoSort = vsort.dataset.vsort;
      render();
      return;
    }
    const bundle = e.target.closest("[data-bundle]");
    if (bundle && !e.target.closest("tr")) {
      bundle.classList.toggle("open");
      return;
    }
    if (e.target.closest("iframe")) return;
    const row = e.target.closest("[data-ad]");
    if (!row) return;
    const waveAd = findWaveAd(row.dataset.ad);
    if (waveAd) {
      openWaveInspector(waveAd);
      return;
    }
    const ad = DATA.ads.find((a) => a.id === row.dataset.ad);
    if (ad) openInspector(ad);
  };
}

function render() {
  renderNav();
  renderPeriods();
  renderMeta();
  $("page").innerHTML = PAGER[state.page]();
  bindPageClicks();
  if (state.selectedAd) {
    const waveAd = findWaveAd(state.selectedAd);
    const ad = DATA.ads.find((a) => a.id === state.selectedAd);
    if (waveAd && (state.page === "library" || state.page === "video")) openWaveInspector(waveAd);
    else if (ad) openInspector(ad);
    else {
      $("inspector").classList.remove("open");
      $("inspector").innerHTML = "";
    }
  } else {
    $("inspector").classList.remove("open");
    $("inspector").innerHTML = "";
  }
}

$("exportBtn").onclick = () => {
  const [from, to] = currentRange();
  const blob = new Blob([JSON.stringify({ range: [from, to], account: accountMetrics(), ads: adsWithSpend().map((x) => ({ name: x.ad.name, ...x.m })) }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bow-evidence-${from}-to-${to}.json`;
  a.click();
};

Promise.all([
  fetch("data/snapshot.json?v=20261010a").then((r) => r.json()),
  fetch("data/previews.json?v=20260930b").then((r) => r.json()).catch(() => ({})),
  fetch("data/waves.json?v=20261007b").then((r) => r.json()),
  fetch("data/wave-previews.json?v=20261007b").then((r) => r.json()),
  fetch("data/wave-media.json?v=20261007f").then((r) => r.json()),
])
  .then(([json, previews, waves, wavePreviews, waveMedia]) => {
    DATA = json;
    PREVIEWS = previews || {};
    WAVES = waves;
    WAVE_PREVIEWS = wavePreviews || {};
    WAVE_MEDIA = waveMedia || {};
    state.from = DATA.meta.minDate;
    state.to = DATA.meta.maxDate;
    const hash = location.hash.slice(1);
    if (PAGER[hash]) state.page = hash;
    render();
  })
  .catch((err) => {
    $("page").innerHTML = `<h1>Could not load data</h1><p class="lede">${err.message}. Serve this folder over http (not file://).</p>`;
  });
