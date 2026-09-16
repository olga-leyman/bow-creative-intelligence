const PAGES = [
  ["story", "01", "Month 1"],
  ["diagnosis", "02", "Audience diagnosis"],
  ["demographics", "03", "Demographics"],
  ["library", "04", "Creative library"],
  ["video", "05", "Video retention"],
  ["engagement", "06", "Engagement & comments"],
  ["google", "07", "Google Ads"],
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
  if (/Concept Testing/i.test(name)) return "Prospecting · Concept Testing";
  if (/Reels Creative Test/i.test(name)) return "Reels creative test";
  if (/Add to Cart/i.test(name)) return "ATC Reels";
  if (/ThruPlay/i.test(name)) return "ThruPlay";
  if (/Priority Retargeting/i.test(name)) return "Priority retargeting";
  if (/LPV Cascade/i.test(name)) return "LPV cascade";
  return name.replace(/^BOW \| US \| ABO \| /, "");
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
  const g = DATA.google && DATA.google.meta;
  const src = g ? "Meta + Google Ads" : "Meta Ads";
  $("metaLine").textContent =
    `Data source · ${src} · ${fmtRange(from, to)} ${to === DATA.meta.maxDate && from !== to ? "(through now)" : ""} · Refreshed ${DATA.meta.pulled} · ${DATA.meta.timezone}`;
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
    return `<p class="caption">Select <strong>30 day</strong> for the Month 1 strategy read. The tiles above still follow whatever window you pick.</p>`;
  }
  return `
    <p class="caption">The tiles above follow the dates you picked. The written Month 1 read is the 17 Aug–11 Sep test. Google Ads is on page 07.</p>
    <div class="insight-grid">
      <div class="insight wide">
        <div class="k">What one month of testing unlocked</div>
        <h3>From broad experimentation to a clearer growth strategy.</h3>
        <p>In the first month, we identified the strongest customer segment, the creative message most likely to convert, and the placements delivering the best commercial results.</p>
      </div>
      <div class="insight">
        <div class="k">Core customer</div>
        <h3>Women 25–34 are the primary growth audience. 18–24 is the efficiency test.</h3>
        <p>Women ages 25–34 generated 5 of the 6 purchases recorded during the month. Women ages 18–24 showed early efficiency potential, delivering the strongest return per advertising dollar among the tested age groups.</p>
        <p>Month 2 audience strategy: prioritize the proven 25–34 segment while continuing to test the promising 18–24 audience.</p>
      </div>
      <div class="insight">
        <div class="k">Winning creative</div>
        <h3>Whole Self Optimizer is the conversion concept. Social Proof supports it.</h3>
        <p>Whole Self Optimizer produced 3 of the month’s 6 purchases and 15 checkouts. Its precision- and formula-led messaging gave customers a clearer reason to buy, making it the strongest foundation for the next round of creative.</p>
        <p>Social Proof contributed 2 purchases, confirming that credibility-driven messaging can capture attention and support conversion.</p>
        <p>Beauty Bestie and Hot Girl Wind Down generated engagement and cart activity without purchases. Lifestyle-led creative can attract interest, but stronger product education and offer messaging are needed to close the sale.</p>
      </div>
      <div class="insight">
        <div class="k">Efficiency</div>
        <h3>The account got more efficient as we cut lower-quality spend.</h3>
        <ul>
          <li>Spend decreased by 57%, from $1,846 in August to $792 in September.</li>
          <li>September generated the same number of checkouts as August—18—on significantly less spend.</li>
          <li>Cost per purchase improved by approximately 14%, from $462 to $396.</li>
          <li>Weekly CTR increased from 2.0% to 3.7%, an 85% improvement.</li>
          <li>Week 3 produced 17 checkouts on only $605 in spend, the strongest mid-funnel result of the month.</li>
        </ul>
        <p style="margin-top:12px">Optimization improved traffic quality and preserved buying intent even as the budget was reduced.</p>
      </div>
      <div class="insight">
        <div class="k">Placements</div>
        <h3>Feed and Reels emerged as the strongest commercial surfaces.</h3>
        <p>Instagram Feed generated the most purchases, while Instagram Reels delivered the strongest meaningful click-through rate at 3.8%. Facebook Feed also produced a purchase from only $75 in spend — another potentially efficient placement to validate.</p>
        <p>Instagram Stories delivered reach and engagement but was less effective at converting. Shift more budget toward Feed and Reels, where customer intent appears stronger.</p>
      </div>
      <div class="insight wide">
        <div class="k">The Month 2 growth plan</div>
        <h3>We now know who is most likely to buy, which message converts, and where purchase activity is strongest.</h3>
        <ul>
          <li>Scale the Whole Self Optimizer conversion concept.</li>
          <li>Develop more founder, UGC, and science-led variations around the winning message.</li>
          <li>Keep Social Proof in rotation as a strong attention and credibility driver.</li>
          <li>Prioritize women ages 25–34 while continuing a measured test of ages 18–24.</li>
          <li>Shift more budget toward Feed and Reels.</li>
          <li>Improve the offer, product page, and checkout journey to convert more of the strong checkout activity into completed purchases.</li>
          <li>Validate tracking to ensure add-to-cart and checkout events are being reported accurately.</li>
        </ul>
        <p style="margin-top:12px">The first month was not simply about generating sales—it gave us a clearer, evidence-based roadmap for improving efficiency and building a repeatable acquisition strategy.</p>
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
        <h1>${month ? "What one month of testing unlocked." : "The selected window, in one view."}</h1>
        <p>${month
          ? "We moved from broad experimentation to a clearer growth strategy—who is most likely to buy, which message converts, and which placements deliver commercial results."
          : "Spend, reach, clicks, landing page views, carts, and purchases for the dates you picked. Open 30 day for the Month 1 strategy read."}</p>
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
      <div class="score ${m.igProfile ? "" : "muted"}"><div class="v">${m.igProfile ? num(m.igProfile) : "—"}</div><div class="l">Instagram profile views</div><div class="h">${m.igEstimated ? "Spend-weighted for this window" : "Ads Manager · this window"}</div></div>
      <div class="score ${m.igFollow ? "" : "muted"}"><div class="v">${m.igFollow ? num(m.igFollow) : "—"}</div><div class="l">Instagram followers</div><div class="h">${m.igEstimated ? "Spend-weighted for this window" : "Ads Manager · this window"}</div></div>
    </div>
    ${monthInsightsHtml()}
    ${DATA.google ? `<div class="insight wide" style="margin-top:16px">
      <div class="k">Google Ads · live since 11 Sep</div>
      <h3>Shopping produced Google’s first purchase. Open Google Ads in the nav for the snapshot.</h3>
      <p>${DATA.meta.googleNote || ""} Date chips on that page follow the same window as Meta.</p>
    </div>` : ""}
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
  const m = googleAccountMetrics();
  const campaigns = googleCampaigns().map((c) => ({ c, tot: sumGoogle(rowsBetween(c.daily || [])) }))
    .sort((a, b) => b.tot.spend - a.tot.spend);
  const mixMap = {};
  for (const { c } of campaigns) {
    for (const row of c.conversions || []) {
      const k = row.name;
      mixMap[k] ||= { name: k, purch: 0, rev: 0, all: 0 };
      mixMap[k].purch += row.purch || 0;
      mixMap[k].rev += row.rev || 0;
      mixMap[k].all += row.all || 0;
    }
  }
  const mix = Object.values(mixMap).sort((a, b) => b.all - a.all);
  const products = (g.products || []).filter((p) => p.imps || p.spend).sort((a, b) => b.spend - a.spend);
  const terms = (g.searchTerms || []).slice(0, 12);
  const shop = campaigns.find((x) => /Shopping/i.test(x.c.type));
  const pmax = campaigns.find((x) => /Performance Max/i.test(x.c.type));
  const display = campaigns.find((x) => /Display/i.test(x.c.type));
  const maxSpend = Math.max(...campaigns.map((x) => x.tot.spend), 1);
  return `
    <div class="hero">
      <div>
        <div class="caption" style="color:#9bb0aa">07 / Google Ads</div>
        <h1>Shopping converted. PMax is still traffic.</h1>
        <p>Google went live 11 Sep. One purchase came from Shopping on the Women’s Multivitamin. Performance Max is driving clicks without a close. Display retargeting has not delivered yet.</p>
      </div>
      <div class="when">Google launch window
        <b>${fmtRange(g.meta.minDate, g.meta.maxDate)}</b>
        ${g.meta.note}
      </div>
    </div>
    <div class="score-grid">
      <div class="score"><div class="v">${usd(m.spend, 0)}</div><div class="l">Google spend</div><div class="h">Selected dates · customer ${g.meta.customerId}</div></div>
      <div class="score"><div class="v">${num(m.imps)}</div><div class="l">Impressions</div><div class="h">${usd(m.cpm)} CPM</div></div>
      <div class="score"><div class="v">${num(m.clicks)}</div><div class="l">Clicks</div><div class="h">${pct(m.ctr)} CTR · ${usd(m.cpc)} CPC</div></div>
      <div class="score"><div class="v">${num(m.purch)}</div><div class="l">Purchases</div><div class="h">${m.cpa == null ? "No purchase CPA" : usd(m.cpa, 0) + " CPA"} · ${m.roas.toFixed(2)}x ROAS</div></div>
    </div>
    <div class="insight-grid">
      <div class="insight">
        <div class="k">What converted</div>
        <h3>Shopping is the Google conversion lane.</h3>
        <p>${shop ? `Shopping spent ${usd(shop.tot.spend)} and produced the only Google purchase (${usd(shop.tot.rev)}).` : "No Shopping delivery in this window."} The converting search term was <strong>womens multivitamin</strong>.</p>
      </div>
      <div class="insight">
        <div class="k">What didn’t close</div>
        <h3>PMax took the clicks. Display has not started.</h3>
        <p>${pmax ? `PMax spent ${usd(pmax.tot.spend)} for ${num(pmax.tot.clicks)} clicks and 0 purchases.` : "No PMax delivery."} ${display ? "Dynamic Display retargeting is enabled at $40/day with $0 delivery." : ""} Keep Shopping as the buy campaign; treat PMax as a traffic test until it converts.</p>
      </div>
    </div>
    <h2>Campaigns</h2>
    <p class="caption">${fmtRange(...currentRange())} · ${campaigns.length} campaigns</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Campaign</th><th>Type</th><th>Status</th>
          <th class="num">Spend</th><th class="num">Impr.</th><th class="num">Clicks</th>
          <th class="num">CTR</th><th class="num">CPC</th><th class="num">Purchases</th>
        </tr></thead>
        <tbody>
          ${campaigns.map(({ c, tot }) => `
            <tr>
              <td><div class="name">${c.name}</div><div class="sub">Started ${c.start || "—"} · $${c.budget || "—"}/day</div></td>
              <td>${c.type}</td>
              <td><span class="status ${tot.purch ? "promising" : tot.spend ? "mixed" : "thin"}">${tot.purch ? "Converted" : tot.spend ? "In market" : "No delivery"}</span></td>
              <td class="num">${usd(tot.spend)}</td>
              <td class="num">${num(tot.imps)}</td>
              <td class="num">${num(tot.clicks)}</td>
              <td class="num">${pct(tot.ctr)}</td>
              <td class="num">${usd(tot.cpc)}</td>
              <td class="num">${tot.purch ? num(tot.purch) : "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <h2>Products</h2>
    <p class="caption">Merchant Center items with delivery in the Google archive</p>
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
    <p class="caption">Shopping queries · Google archive to date. Conversion mix below is also archive-level.</p>
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
              <td class="num">${t.purch ? num(t.purch) : "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <h2>On-site actions</h2>
    <p class="caption">Google Shopping App tags · archive totals, not date-chipped</p>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Action</th><th class="num">Count</th><th class="num">In conversions</th><th class="num">Value</th>
        </tr></thead>
        <tbody>
          ${mix.map((row) => `
            <tr>
              <td>${row.name.replace("Google Shopping App ", "")}</td>
              <td class="num">${num(row.all)}</td>
              <td class="num">${row.purch ? num(row.purch) : "—"}</td>
              <td class="num">${row.rev ? usd(row.rev) : "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="caption">${DATA.meta.googleNote || g.meta.note}</p>
  `;
}

const PAGER = { story: pageStory, diagnosis: pageDiagnosis, demographics: pageDemographics, library: pageLibrary, video: pageVideo, engagement: pageEngagement, google: pageGoogle };

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

fetch("data/snapshot.json?v=20260916a")
  .then((r) => r.json())
  .then((json) => {
    DATA = json;
    state.from = DATA.meta.minDate;
    state.to = DATA.meta.maxDate;
    render();
  })
  .catch((err) => {
    $("page").innerHTML = `<h1>Could not load data</h1><p class="lede">${err.message}. Serve this folder over http (not file://).</p>`;
  });
