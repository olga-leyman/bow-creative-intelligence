const PAGES = [
  ["story", "01", "Month 1"],
  ["diagnosis", "02", "Audience diagnosis"],
  ["demographics", "03", "Demographics"],
  ["library", "04", "Creative library"],
  ["video", "05", "Video retention"],
  ["engagement", "06", "Engagement & comments"],
];

const PRESETS = [
  ["1d", "1 day"],
  ["7d", "7 day"],
  ["14d", "14 day"],
  ["30d", "30 day"],
  ["custom", "Custom"],
];

const state = {
  page: "story",
  preset: "30d",
  from: null,
  to: null,
  selectedAd: null,
  sort: "spend",
};

let DATA = null;

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

function currentRange() {
  const min = DATA.meta.minDate;
  const max = DATA.meta.maxDate;
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

function windowMetrics() {
  const [from, to] = currentRange();
  const m = accountMetrics();
  const w = DATA.windows && DATA.windows[`${from}_${to}`];
  if (w) {
    m.reach = w.reach;
    m.igProfile = w.igProfile || 0;
    m.igFollow = w.igFollow || 0;
    m.recallers = w.recallers || 0;
    m.recallRate = w.recallRate;
    m.uniqueReach = true;
  } else {
    m.uniqueReach = false;
  }
  return m;
}

function isMonthLook() {
  if (state.preset === "30d") return true;
  const [from, to] = currentRange();
  const days = (Date.parse(to + "T12:00:00") - Date.parse(from + "T12:00:00")) / 86400000;
  return days >= 25;
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

function statusFor(m, isVideo) {
  if (m.spend < 8 || m.imps < 250) return ["thin", "Insufficient data"];
  if (m.purch > 0 && m.linkCtr < 1.1) return ["mixed", "Mixed signal"];
  if (m.purch > 0) return ["promising", "Promising"];
  if ((isVideo && m.hook != null && m.hook >= 4) || m.linkCtr >= 1.2 || m.engRate >= 4) return ["promising", "Promising"];
  return ["needs", "Needs more data"];
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
    render();
  };
}

function renderPeriods() {
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
  const presetLabel = PRESETS.find((p) => p[0] === state.preset)[1];
  $("metaLine").textContent =
    `Data source · Meta Ads · ${fmtRange(from, to)} ${to === DATA.meta.maxDate && from !== to ? "(through now)" : ""} · Refreshed ${DATA.meta.pulled} · ${DATA.meta.timezone}`;
  $("crumb").textContent = PAGES.find((p) => p[0] === state.page)[2];
}

function openInspector(ad) {
  state.selectedAd = ad.id;
  const m = adMetrics(ad);
  const [st, sl] = statusFor(m, ad.isVideo);
  const maxF = Math.max(m.imps, 1);
  $("inspector").classList.add("open");
  $("inspector").innerHTML = `
    <button class="close-x" id="closeIns">×</button>
    ${thumbEl(ad, 0).replace('class="thumb"', 'class="preview"')}
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
      <div>Engagement<strong>${pct(m.engRate)}</strong></div>
    </div>
    <div class="caption">Performance funnel · selected window</div>
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
    return `<p class="caption">Select <strong>30 day</strong> for the Month 1 audience, buyer, and trend read. The tiles above still follow whatever window you pick.</p>`;
  }

  const m = windowMetrics();
  const ageRows = rowsBetween(DATA.ageDaily).filter((r) => r.gender === "female" && r.age !== "Unknown");
  const ages = groupedMetrics(ageRows, (r) => r.age);
  const buyers = [...ages].sort((a, b) => b.m.purch - a.m.purch || b.m.spend - a.m.spend);
  const volume = ages.find((a) => a.key === "25-34") || buyers[0];
  const young = ages.find((a) => a.key === "18-24");
  const older = ages.find((a) => a.key === "35-44");
  const spendAll = ages.reduce((s, a) => s + a.m.spend, 0) || 1;

  const flat = flattenAdDaily();
  const concepts = groupedMetrics(flat.filter((r) => DATA.concepts.includes(r.concept)), (r) => r.concept);
  const closer = [...concepts].sort((a, b) => b.m.purch - a.m.purch || a.m.spend - b.m.spend)[0];
  const waste = [...concepts].filter((c) => !c.m.purch).sort((a, b) => b.m.spend - a.m.spend)[0];
  const ads = adsWithSpend().sort((a, b) => b.m.purch - a.m.purch || b.m.spend - a.m.spend);
  const heroAd = ads.find((x) => x.m.purch > 0);
  const atcHero = [...ads].sort((a, b) => b.m.atc - a.m.atc)[0];

  const lanes = groupedMetrics(flat, (r) => r.lane);
  const prospect = lanes.find((l) => /prospect/i.test(l.key));
  const atcLane = lanes.find((l) => /atc/i.test(l.key));
  const warm = lanes.filter((l) => /lpv|rtg|retarget/i.test(l.key));
  const thru = lanes.find((l) => /thru/i.test(l.key));
  const warmPurch = warm.reduce((s, l) => s + l.m.purch, 0);
  const warmSpend = warm.reduce((s, l) => s + l.m.spend, 0);

  const plats = groupedMetrics(rowsBetween(DATA.placementDaily), (r) => r.placement)
    .filter((p) => p.m.spend >= 20);
  const topPlat = plats[0];
  const bestCtrPlat = [...plats].filter((p) => p.m.spend >= 200).sort((a, b) => b.m.ctr - a.m.ctr)[0] || plats[0];
  const bestPurchPlat = [...plats].sort((a, b) => b.m.purch - a.m.purch || b.m.rev - a.m.rev)[0];

  const weeks = weekSlices(rowsBetween(DATA.accountDaily));
  const w1 = weeks[0];
  const wLast = weeks[weeks.length - 1];
  const purchDays = rowsBetween(DATA.accountDaily).filter((d) => d.purch > 0);
  const aug = sumMetrics(rowsBetween(DATA.accountDaily).filter((d) => d.date < "2026-09-01"));
  const sep = sumMetrics(rowsBetween(DATA.accountDaily).filter((d) => d.date >= "2026-09-01"));
  const aov = m.purch ? m.rev / m.purch : 0;
  const lpvRate = m.clicks ? (100 * m.lpv) / m.clicks : 0;
  const closeRate = m.lpv ? (100 * m.purch) / m.lpv : 0;

  const youngLine = young
    ? `Women 18–24 spent ${usd(young.m.spend)} (${pct((100 * young.m.spend) / spendAll, 0)} of age-split spend) and produced ${num(young.m.purch)} purchase${young.m.purch === 1 ? "" : "s"}${young.m.rev ? ` for ${usd(young.m.rev)}` : ""}${young.m.purch ? ` — CPA ${usd(young.m.cpa, 0)}, ROAS ${young.m.roas.toFixed(2)}x, the better return per dollar so far.` : "."}`
    : "";
  const olderLine = older
    ? `Women 35–44 spent ${usd(older.m.spend)} with ${num(older.m.atc)} add-to-carts and ${num(older.m.purch)} purchases. Their link CTR (${pct(older.m.linkCtr)}) is the highest of the three bands — they will click and browse; they are not closing.`
    : "";

  const wasteLine = waste
    ? `${waste.key} took the most money among non-converting concepts (${usd(waste.m.spend)}, ${num(waste.m.link)} link clicks, ${num(waste.m.purch)} purchases). It is an attention / traffic concept, not a closer.`
    : "";
  const atcLine = atcLane
    ? `ATC Reels spent ${usd(atcLane.m.spend)} and produced ${num(atcLane.m.atc)} carts and ${num(atcLane.m.ic)} checkouts with ${num(atcLane.m.purch)} purchases — a mid-funnel that does not finish.`
    : "";
  const thruLine = thru
    ? `ThruPlay spent ${usd(thru.m.spend)} for ${num(thru.m.thru)} ThruPlays and ${num(thru.m.lpv)} landing page views. That is the only lane where Meta’s estimated ad-recall field can fire; purchase campaigns in this account return 0. Brand awareness is not a score we can read off the buying campaigns.`
    : `Purchase campaigns in this account do not return estimated ad recall. Brand awareness is not a native score on this optimization.`;

  return `
    <h2>What one month of work actually taught us</h2>
    <p class="lede">High-level, but specific: who is in the data, who is buying, which creative is doing a commercial job, and how the month shifted as spend came down.</p>
    <div class="insight-grid">
      <div class="insight">
        <div class="k">Who is buying</div>
        <h3>The buyer is a 25–34 woman. The more efficient dollar is slightly younger. 35–44 is not converting.</h3>
        <p>${volume ? `Women 25–34 absorbed ${usd(volume.m.spend)} — ${pct((100 * volume.m.spend) / spendAll, 0)} of spend that Meta split by age — and ${num(volume.m.purch)} of ${num(m.purch)} purchases. That is the volume engine, not the efficiency win: CPA ${volume.m.cpa == null ? "—" : usd(volume.m.cpa, 0)}, ROAS ${volume.m.roas.toFixed(2)}x, blended with the rest of the account at ${usd(m.cpa || 0, 0)} CPA and ${m.roas.toFixed(2)}x ROAS on ${usd(m.rev)} revenue.` : ""}</p>
        <p>${youngLine}</p>
        <p>${olderLine}</p>
        <p>Targeting is women-only, US, engaged shoppers inside five interest bundles. Six purchases is a direction, not a statistically stable audience. Treat 25–34 as the working core, keep a slice of 18–24 in market, and stop expecting 35–44 to buy from this creative set.</p>
      </div>
      <div class="insight">
        <div class="k">What is working</div>
        <h3>${closer ? closer.key : "One concept"} is the conversion idea. Social proof helps. Vibe creative is not selling.</h3>
        <p>${closer ? `${closer.key} produced ${num(closer.m.purch)} of ${num(m.purch)} purchases on ${usd(closer.m.spend)} (${closer.m.cpa == null ? "—" : usd(closer.m.cpa, 0)} CPA) and ${num(closer.m.ic)} checkouts. ${heroAd ? `The hero asset is ${heroAd.ad.concept} ${heroAd.ad.variant || ""} · ${heroAd.ad.format} in ${heroAd.ad.lane} — ${num(heroAd.m.purch)} purchases on ${usd(heroAd.m.spend)}.` : ""}` : ""}</p>
        <p>${concepts.filter((c) => c.m.purch > 0 && c.key !== (closer && closer.key)).map((c) => `${c.key}: ${num(c.m.purch)} purchase${c.m.purch === 1 ? "" : "s"} on ${usd(c.m.spend)}${c.m.rev ? `, ${usd(c.m.rev)} revenue` : ""}${c.m.rev && c.m.rev < 10 ? " (trial / low AOV — not the offer we want to scale)." : "."}`).join(" ")}</p>
        <p>${wasteLine} ${atcHero && atcHero.m.atc ? `${atcHero.ad.concept} ${atcHero.ad.variant || ""} led add-to-cart (${num(atcHero.m.atc)} ATC) without a sale.` : ""}</p>
        <p>${prospect ? `Prospecting still did the commercial work: ${usd(prospect.m.spend)}, ${num(prospect.m.purch)} purchases.` : ""} ${warm.length ? `Warm traffic (LPV cascade + priority retargeting) spent ${usd(warmSpend)} and added ${num(warmPurch)} purchase${warmPurch === 1 ? "" : "s"} — more efficient on less money, too small to call a system.` : ""} ${atcLine}</p>
      </div>
      <div class="insight">
        <div class="k">Where it showed up</div>
        <h3>${topPlat ? `${topPlat.key} took the most spend.` : "Placement is uneven."} Feed is closing; Stories is expensive.</h3>
        <p>${plats.map((p) => `${p.key}: ${usd(p.m.spend)}, ${num(p.m.purch)} purchase${p.m.purch === 1 ? "" : "s"}${p.m.purch && p.m.rev === 0 ? " with $0 attributed revenue" : p.m.rev ? ` / ${usd(p.m.rev)}` : ""}, CTR ${pct(p.m.ctr, 1)}.`).join(" ")}</p>
        <p>${bestPurchPlat ? `${bestPurchPlat.key} led purchases (${num(bestPurchPlat.m.purch)}).` : ""} ${bestCtrPlat ? `${bestCtrPlat.key} had the strongest click-through (${pct(bestCtrPlat.m.ctr, 1)}) among placements with real spend.` : ""} Audience Network rewarded and other junk inventory spent without clicks — cut it. Instagram Stories is the placement to interrogate first: highest dollars, weakest commercial return.</p>
      </div>
      <div class="insight">
        <div class="k">How the month moved</div>
        <h3>Spend came down. Click-through went up. Checkouts held. Purchases never compounded.</h3>
        <p>${weeks.map((w) => `${w.label} (${fmtRange(w.from, w.to)}): ${usd(w.m.spend)}, CTR ${pct(w.m.ctr, 1)}, ${num(w.m.purch)} purchase${w.m.purch === 1 ? "" : "s"}, ${num(w.m.ic)} checkouts.`).join(" ")}</p>
        <p>August ran ${usd(aug.spend)} and ${num(aug.purch)} purchases. September, on ${usd(sep.spend)}, produced ${num(sep.purch)} purchases and ${usd(sep.rev)} revenue — almost the same checkout count (${num(sep.ic)} vs ${num(aug.ic)}) on far less spend. The funnel mid-stage got healthier as volume was cut. CTR rose from ${w1 ? pct(w1.m.ctr, 1) : "—"} in week 1 to ${wLast ? pct(wLast.m.ctr, 1) : "—"} in the latest week.</p>
        <p>${num(purchDays.length)} purchase days in the month, never two in one day. Blended AOV ${usd(aov)}. Mix includes a $2.99 trial and $23–$34 orders — not a stable $20 subscription read yet. ${num(m.clicks)} clicks became ${num(m.lpv)} landing page views (${pct(lpvRate, 0)}), then ${num(m.purch)} purchases (${pct(closeRate, 1)} of LPVs). Checkouts (${num(m.ic)}) outnumber add-to-carts (${num(m.atc)}) — the pixel is under-firing ATC or over-counting IC; do not scale off the cart number alone.</p>
      </div>
      <div class="insight wide">
        <div class="k">Carry this into month 2</div>
        <h3>Scale the closer. Keep social proof in rotation. Stop paying for attention that does not buy.</h3>
        <ul>
          <li>Lean into Whole Self Optimizer (precision / “the formula” story) and the Feed 4:5 prospecting cut that already closed twice. That is the conversion concept.</li>
          <li>Keep Social Proof as the interrupt: it stops the scroll and has contributed purchases, including on warm LPV traffic.</li>
          <li>Beauty Bestie and Hot Girl Wind Down earned attention and carts. They have not earned a sale. Do not give them more prospecting budget until the offer/landing path is proven on the converting concept.</li>
          <li>ATC Reels is a leak, not a ladder. Fix the close (offer, PDP, checkout) before pouring more into cart campaigns.</li>
          <li>Audience: 25–34 women remain the working core; 18–24 deserves a measured slice; 35–44 is a browse audience on this creative.</li>
          <li>Six sales on ${usd(m.spend)} is a first-month map, not a scaling brief. Month 2 UGC / founder / science hooks are not in this spend yet — that is the next learning, not a continuation of Beauty Bestie volume.</li>
        </ul>
        <p style="margin-top:12px">${thruLine} Instagram profile visits and new followers are ${num(m.igProfile)} / ${num(m.igFollow)} because these ads optimize for purchase, not profile traffic. Unique people reached this month: ${num(m.reach)}.</p>
      </div>
    </div>
  `;
}

function pageStory() {
  const m = windowMetrics();
  const [from, to] = currentRange();
  const month = isMonthLook();
  return `
    <div class="hero">
      <div>
        <div class="caption" style="color:#9bb0aa">01 / Month 1</div>
        <h1>${month ? "What the first month of paid actually taught us." : "The selected window, in one view."}</h1>
        <p>${month
          ? "Not a launch recap — a read on who is in market, who is buying, which ideas are commercial, and how delivery changed as spend came down. Tiles follow the 30-day window."
          : "Spend, reach, clicks, landing page views, carts, and purchases for the dates you picked. Open 30 day for the Month 1 audience and trend insights."}</p>
      </div>
      <div class="when">${month ? "First month in market" : "Selected window"}
        <b>${fmtRange(from, to)}</b>
        ${DATA.meta.note}
      </div>
    </div>
    <div class="score-grid">
      <div class="score"><div class="v">${usd(m.spend, 0)}</div><div class="l">Total spend</div></div>
      <div class="score"><div class="v">${num(m.reach)}</div><div class="l">Total reach</div><div class="h">${m.uniqueReach ? "Unique people in this window" : "Sum of daily reach — overlap not removed"}</div></div>
      <div class="score"><div class="v">${num(m.clicks)}</div><div class="l">Total clicks</div><div class="h">${pct(m.ctr)} CTR · ${usd(m.cpc)} CPC</div></div>
      <div class="score"><div class="v">${num(m.lpv)}</div><div class="l">Landing page views</div><div class="h">${m.cplpv == null ? "—" : usd(m.cplpv)} per LPV</div></div>
      <div class="score"><div class="v">${num(m.atc)}</div><div class="l">Total add to cart</div><div class="h">${num(m.ic)} checkouts initiated</div></div>
      <div class="score"><div class="v">${num(m.purch)}</div><div class="l">Total purchases</div><div class="h">${m.cpa == null ? "No purchase CPA" : usd(m.cpa, 0) + " CPA"} · ${m.roas.toFixed(2)}x ROAS</div></div>
      <div class="score muted"><div class="v">${m.igProfile ? num(m.igProfile) : "—"}</div><div class="l">Instagram profile views</div><div class="h">Not reported on purchase campaigns</div></div>
      <div class="score muted"><div class="v">${m.igFollow ? num(m.igFollow) : "—"}</div><div class="l">Instagram followers</div><div class="h">Needs a follow / profile-visit objective</div></div>
    </div>
    ${monthInsightsHtml()}
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
    <p class="lede">Five distinct women’s interest-and-behavior bundles, each paired with a matching creative concept and format mix.</p>
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
            Interests: ${(g.meta.interests || []).join(", ") || "—"}
            ${(g.meta.behaviors || []).length ? " · Behaviors: " + g.meta.behaviors.join(", ") : ""}
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
  const list = adsWithSpend().sort((a, b) => (b.m[state.sort] || 0) - (a.m[state.sort] || 0));
  return `
    <h1>Creative library</h1>
    <p class="lede">Every Body of Work ad that delivered in the selected window. Click a row for the inspector.</p>
    <p class="caption">${fmtRange(...currentRange())} · ${list.length} ads · sorted by ${state.sort}</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Creative</th><th>Placement / lane</th><th>Status</th>
          <th class="num">Spend</th><th class="num">CTR</th><th class="num">Link CTR</th>
          <th>Social</th><th class="num">Hook</th><th class="num">Purchases</th>
        </tr></thead>
        <tbody>
          ${list.map((x) => {
            const [st, sl] = statusFor(x.m, x.ad.isVideo);
            const sel = state.selectedAd === x.ad.id ? "selected" : "";
            return `<tr class="${sel}" data-ad="${x.ad.id}">
              <td><div class="ad-cell">${thumbEl(x.ad)}<div><div class="name">${x.ad.concept}${x.ad.variant ? " " + x.ad.variant : ""}</div><div class="sub">${x.ad.isVideo ? "Single video" : "Single image"} · ${x.ad.format}</div></div></div></td>
              <td>${x.ad.format}<div class="sub">${x.ad.lane}</div></td>
              <td><span class="status ${st}">${sl}</span></td>
              <td class="num">${usd(x.m.spend)}</td>
              <td class="num">${pct(x.m.ctr)}</td>
              <td class="num">${pct(x.m.linkCtr)}</td>
              <td>${num(x.m.react)} reactions · ${num(x.m.comment)} comments · ${num(x.m.share)} shares</td>
              <td class="num">${x.m.hook == null ? "—" : pct(x.m.hook)}</td>
              <td class="num">${x.m.purch ? num(x.m.purch) + " Purchase" : "—"}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function pageVideo() {
  const vids = adsWithSpend()
    .filter((x) => x.ad.isVideo && x.m.plays > 0)
    .sort((a, b) => (b.m.hook || 0) - (a.m.hook || 0));
  if (!vids.length) return `<h1>Video retention</h1><p class="lede">No video delivery in this window.</p>`;
  const bestTraffic = [...vids].sort((a, b) => b.m.link - a.m.link)[0];
  const bestEng = [...vids].sort((a, b) => b.m.engRate - a.m.engRate)[0];
  const bestHook = vids[0];
  const maxHook = Math.max(...vids.map((v) => v.m.hook || 0), 1);
  const tot = sumMetrics(vids.flatMap((v) => rowsBetween(v.ad.daily)));
  return `
    <div class="caption">04 / Video creative analysis</div>
    <h1>Which video stopped attention—and which one earned the click?</h1>
    <p class="lede">Attention → retention → traffic. Hook rate is 25% video views ÷ impressions.</p>
    <div class="kpi-row">
      <div class="kpi"><div class="v">${tot.hook == null ? "—" : pct(tot.hook)}</div><div class="l">Hook rate</div></div>
      <div class="kpi"><div class="v">${tot.hold == null ? "—" : pct(tot.hold)}</div><div class="l">25% retained</div></div>
      <div class="kpi"><div class="v">${tot.complete == null ? "—" : pct(tot.complete)}</div><div class="l">Completion</div></div>
      <div class="kpi"><div class="v">${pct(tot.linkCtr)}</div><div class="l">Link CTR</div></div>
    </div>
    <div class="signal-grid">
      <div class="signal"><div class="k">Best traffic video</div><h3>${bestTraffic.ad.concept} ${bestTraffic.ad.variant}</h3><p>${pct(bestTraffic.m.linkCtr)} link CTR · ${num(bestTraffic.m.link)} link clicks · ${num(bestTraffic.m.imps)} impressions</p></div>
      <div class="signal"><div class="k">Best engagement video</div><h3>${bestEng.ad.concept} ${bestEng.ad.variant}</h3><p>${pct(bestEng.m.engRate)} engagement · ${num(bestEng.m.eng)} engagements</p></div>
      <div class="signal"><div class="k">Highest hook rate</div><h3>${bestHook.ad.concept} ${bestHook.ad.variant}</h3><p>${pct(bestHook.m.hook)} hook · ${num(bestHook.m.imps)} impressions</p></div>
    </div>
    <h2>One-glance creative comparison</h2>
    <p class="caption">Sorted by highest hook rate · ${fmtRange(...currentRange())}</p>
    <div class="bars">
      ${vids.map((x) => `
        <div class="bar-row" data-ad="${x.ad.id}" style="cursor:pointer">
          ${thumbEl(x.ad, 52)}
          <div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
              <span>${x.ad.concept} ${x.ad.variant} · ${x.ad.format}</span>
              <span>${pct(x.m.hook)} hook · ${pct(x.m.linkCtr)} link CTR</span>
            </div>
            <div class="bar-stack">
              <span class="seg-hook" style="width:${(100 * (x.m.hook || 0)) / maxHook}%"></span>
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
  return `
    <h1>Engagement & comments</h1>
    <p class="lede">On-ad social proof in the selected window. Comment volume is still thin — most signal is reactions, saves, and shares.</p>
    <div class="kpi-row">
      <div class="kpi"><div class="v">${num(tot.react)}</div><div class="l">Reactions</div></div>
      <div class="kpi"><div class="v">${num(tot.comment)}</div><div class="l">Comments</div></div>
      <div class="kpi"><div class="v">${num(tot.share)}</div><div class="l">Shares</div></div>
      <div class="kpi"><div class="v">${num(tot.save)}</div><div class="l">Saves</div></div>
    </div>
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

const PAGER = { story: pageStory, diagnosis: pageDiagnosis, demographics: pageDemographics, library: pageLibrary, video: pageVideo, engagement: pageEngagement };

function bindPageClicks() {
  $("page").onclick = (e) => {
    const bundle = e.target.closest("[data-bundle]");
    if (bundle && !e.target.closest("tr")) {
      bundle.classList.toggle("open");
      return;
    }
    const row = e.target.closest("[data-ad]");
    if (!row) return;
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
    const ad = DATA.ads.find((a) => a.id === state.selectedAd);
    if (ad) openInspector(ad);
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

fetch("data/snapshot.json")
  .then((r) => r.json())
  .then((json) => {
    DATA = json;
    const [f, t] = [DATA.meta.minDate, DATA.meta.maxDate];
    state.from = addDays(t, -13) < f ? f : addDays(t, -13);
    state.to = t;
    render();
  })
  .catch((err) => {
    $("page").innerHTML = `<h1>Could not load data</h1><p class="lede">${err.message}. Serve this folder over http (not file://).</p>`;
  });
