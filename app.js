const PAGES = [
  ["story", "01", "Month 1 story"],
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
  preset: "14d",
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
  const z = { spend:0, imps:0, clicks:0, reach:0, purch:0, rev:0, lpv:0, atc:0, ic:0, link:0, react:0, comment:0, save:0, share:0, eng:0, plays:0, p25:0, p50:0, p75:0, p100:0, thru:0 };
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

function pageStory() {
  const launch = sumMetrics(DATA.accountDaily.filter((d) => d.date >= "2026-08-18" && d.date <= "2026-08-20"));
  const m = accountMetrics();
  const [from, to] = currentRange();
  const ads = adsWithSpend().sort((a, b) => b.m.link - a.m.link);
  const byConcept = {};
  for (const x of ads) {
    if (!DATA.concepts.includes(x.ad.concept)) continue;
    byConcept[x.ad.concept] ??= { link: 0, lpv: 0, purch: 0, eng: 0, spend: 0 };
    const c = byConcept[x.ad.concept];
    c.link += x.m.link; c.lpv += x.m.lpv; c.purch += x.m.purch; c.eng += x.m.eng; c.spend += x.m.spend;
  }
  const ranked = Object.entries(byConcept).sort((a, b) => b[1].link - a[1].link);
  const conversion = ranked.find(([, v]) => v.purch > 0);
  return `
    <div class="hero">
      <div>
        <div class="caption" style="color:#9bb0aa">01 / Month 1 client story</div>
        <h1>From broad testing to clearer moves.</h1>
        <p>The launch created a real cold-prospecting learning environment. Five women’s interest-and-behavior bundles. Use the date control above to read the same story in 1, 7, 14, or 30 days — or a custom window from 17 Aug through now.</p>
      </div>
      <div class="when">Launched Monday, 17 Aug
        <b>18–20 Aug</b>
        First three completed days · purchase optimization
      </div>
    </div>
    <div class="kpi-row">
      <div class="kpi"><div class="v">${usd(launch.spend)}</div><div class="l">Launch spend</div></div>
      <div class="kpi"><div class="v">${num(launch.imps)}</div><div class="l">Impressions</div></div>
      <div class="kpi"><div class="v">${num(launch.link)}</div><div class="l">Link clicks</div></div>
      <div class="kpi"><div class="v">${num(launch.lpv)}</div><div class="l">Landing page views</div></div>
      <div class="kpi"><div class="v">${num(launch.purch)}</div><div class="l">Purchase signal</div></div>
    </div>
    <div class="callout">Selected window ${fmtRange(from, to)}: ${usd(m.spend)} spend · ${num(m.link)} link clicks · ${num(m.lpv)} LPVs · ${num(m.purch)} purchases · ${m.roas.toFixed(2)}x ROAS. ${DATA.meta.note}</div>
    <h2>Signals to carry forward</h2>
    <div class="signal-grid">
      ${ranked.slice(0, 3).map(([name, v], i) => {
        const label = i === 0 ? "Primary traffic / engagement" : conversion && conversion[0] === name ? "Conversion validation" : "Primary traffic intent";
        return `<div class="signal"><div class="k">${label}</div><h3>${name}</h3><p>${num(v.link)} link clicks · ${num(v.lpv)} landing page views${v.purch ? " · " + v.purch + " purchase" : ""}</p></div>`;
      }).join("")}
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
