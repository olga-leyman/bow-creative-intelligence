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
  ["m1", "Month 1"],
  ["1d", "1 day"],
  ["7d", "7 day"],
  ["14d", "14 day"],
  ["30d", "30 day"],
  ["custom", "Custom"],
];

const state = {
  page: "story",
  preset: "m1",
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

function pageStory() {
  const p = paidMediaTotals();
  const m = p.meta;
  const [from, to] = currentRange();
  const month = isMonthLook();
  const m1Chip = state.preset === "m1";
  const spendHint = p.g.spend
    ? `Meta ${usd(p.meta.spend, 0)} · Google ${usd(p.g.spend, 0)}`
    : `Meta ${usd(p.meta.spend, 0)} · Google not live yet`;
  return `
    <div class="hero">
      <div>
        <div class="caption" style="color:#9bb0aa">01 / ${m1Chip ? "Month 1 overview" : (DATA.conceptMeta && DATA.conceptMeta["UGC Cold"] ? "Month 1 + Month 2" : "Month 1")}</div>
        <h1>${m1Chip || month ? "Building the foundation for scale." : "The selected window, in one view."}</h1>
        <p>${m1Chip || month
          ? "Month 1 turned structured testing into a focused growth plan. Score cards use Shopify online-store orders against paid media spend."
          : "Store orders and revenue come from Shopify. Paid media spend is Meta plus Google. Open Month 1 for the strategy read."}</p>
      </div>
      <div class="when">${m1Chip ? "Month 1" : month ? "First month in market" : "Selected window"}
        <b>${fmtRange(...(m1Chip ? month1LabelRange() : [from, to]))}</b>
        ${DATA.meta.shopifyNote || DATA.meta.note}
      </div>
    </div>
    <div class="score-grid">
      <div class="score"><div class="v">${usd(p.spend, 0)}</div><div class="l">Paid media spend</div><div class="h">${spendHint}</div></div>
      <div class="score"><div class="v">${num(m.reach)}</div><div class="l">Total reach</div><div class="h">${m.uniqueReach ? "Unique people in this window" : "Sum of daily reach — overlap not removed"}</div></div>
      <div class="score"><div class="v">${num(p.clicks)}</div><div class="l">Total clicks</div><div class="h">${pct(p.ctr)} CTR · ${usd(p.cpc)} CPC${p.g.clicks ? " · Meta + Google" : ""}</div></div>
      <div class="score"><div class="v">${num(m.lpv)}</div><div class="l">Landing page views</div><div class="h">${m.cplpv == null ? "—" : usd(m.cplpv)} per LPV · Meta</div></div>
      <div class="score"><div class="v">${num(p.shop.orders)}</div><div class="l">Store orders</div><div class="h">Shopify online store</div></div>
      <div class="score"><div class="v">${usd(p.shop.revenue, 0)}</div><div class="l">Store revenue</div><div class="h">${p.shop.orders ? usd(p.shop.aov, 0) + " AOV" : "No store orders"}</div></div>
      <div class="score"><div class="v">${p.cpa == null ? "—" : usd(p.cpa, 0)}</div><div class="l">CPA</div><div class="h">Paid media spend / Shopify store orders</div></div>
      <div class="score"><div class="v">${p.roas.toFixed(2)}x</div><div class="l">Blended ROAS</div><div class="h">Shopify store revenue / paid media spend</div></div>
    </div>
    ${monthInsightsHtml()}
    ${ugcInsightHtml()}
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

fetch("data/snapshot.json?v=20260917g")
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
