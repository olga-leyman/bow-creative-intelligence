const state = {
  month: "all",
  concept: "all",
  format: "all",
  q: "",
  sort: "reach",
  dir: "desc",
  selected: null,
};

let LIBRARY = null;

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[ch]));
}

function num(value) {
  return Number(value).toLocaleString("en-US");
}

function usd(value) {
  return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function ctr(row) {
  if (!row.imps) return null;
  return ((row.link || 0) / row.imps) * 100;
}

function cpc(row) {
  if (!row.link) return null;
  return row.spend / row.link;
}

function hook(row) {
  if (!row.video || row.p25 == null || !row.imps) return null;
  return (row.p25 / row.imps) * 100;
}

function done(row) {
  if (!row.video || row.p100 == null || !row.plays) return null;
  return (row.p100 / row.plays) * 100;
}

function pct(value, digits) {
  return value == null ? "—" : `${value.toFixed(digits)}%`;
}

function money(value) {
  return value == null ? "—" : usd(value);
}

function metric(row, key) {
  if (key === "name") return row.name.toLowerCase();
  if (key === "reach") return row.reach ?? null;
  if (key === "ctr") return ctr(row);
  if (key === "cpc") return cpc(row);
  if (key === "hook") return hook(row);
  if (key === "done") return done(row);
  return null;
}

function visibleRows() {
  const q = state.q.trim().toLowerCase();
  const rows = LIBRARY.rows.filter((row) => {
    if (state.month !== "all" && row.month !== state.month) return false;
    if (state.concept !== "all" && row.concept !== state.concept) return false;
    if (state.format !== "all" && row.format !== state.format) return false;
    if (!q) return true;
    const hay = `${row.name} ${row.concept} ${row.test} ${row.title || ""} ${row.copy || ""}`.toLowerCase();
    return hay.includes(q);
  });
  rows.sort((a, b) => {
    const av = metric(a, state.sort);
    const bv = metric(b, state.sort);
    if (av == null && bv == null) return a.name.localeCompare(b.name);
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
    if (cmp === 0) return b.reach - a.reach;
    return state.dir === "asc" ? cmp : -cmp;
  });
  return rows;
}

function statusClass(status) {
  if (status === "Live") return "promising";
  if (status === "Ad issue") return "mixed";
  return "thin";
}

function sortButton(key, label, numeric) {
  const on = state.sort === key;
  const mark = on ? (state.dir === "asc" ? " ↑" : " ↓") : "";
  return `<th class="${numeric ? "num" : ""}"><button type="button" data-sort="${key}">${label}${mark}</button></th>`;
}

function preview(row) {
  const media = row.media || {};
  if (media.kind === "video" && media.src) {
    return `<video class="media-video" src="${esc(media.src)}" controls playsinline preload="metadata"></video>`;
  }
  return (media.urls || []).map((url, i) => (
    `<img class="media-still" src="${esc(url)}" alt="${esc(row.name)}${media.urls.length > 1 ? " " + (i + 1) : ""}" />`
  )).join("");
}

function facts(row) {
  const items = [];
  const add = (label, value) => { if (value != null && value !== "") items.push([label, value]); };
  if (row.reach > 0) add("Reach", num(row.reach));
  if (row.spend > 0) add("Spend", usd(row.spend));
  if (row.imps > 0) add("Impressions", num(row.imps));
  const linkCtr = ctr(row);
  if (linkCtr != null) add("Link CTR", `${linkCtr.toFixed(2)}%`);
  const cost = cpc(row);
  if (cost != null) add("CPC", usd(cost));
  if (row.link > 0) add("Link clicks", num(row.link));
  if (row.atc > 0) add("Add to cart", num(row.atc));
  if (row.ic > 0) add("Checkout", num(row.ic));
  if (row.purch > 0) add("Purchases", num(row.purch));
  if (row.value > 0) add("Purchase value", usd(row.value));
  if (row.purch > 0 && row.spend > 0) add("Cost per purchase", usd(row.spend / row.purch));
  if (row.video && row.plays > 0) add("Plays", num(row.plays));
  const hookRate = hook(row);
  if (hookRate != null) add("Hook", `${hookRate.toFixed(1)}%`);
  const completed = done(row);
  if (completed != null) add("Completed", `${completed.toFixed(1)}%`);
  return `<div class="fact-grid">${items.map(([label, value]) => `<div><div class="v">${value}</div><div class="l">${esc(label)}</div></div>`).join("")}</div>`;
}

function openInspector(row) {
  state.selected = row.id;
  document.querySelectorAll("#library tbody tr").forEach((tr) => {
    tr.classList.toggle("selected", tr.dataset.id === row.id);
  });
  const inspector = $("inspector");
  inspector.classList.add("open");
  inspector.innerHTML = `
    <div class="sheet">
      <button class="close-x" id="closeIns" type="button">×</button>
      ${preview(row)}
      <h3>${esc(row.name)}</h3>
      <div class="caption">${esc(row.month)} · ${esc(row.test)} · ${esc(row.format)}</div>
      <span class="status ${statusClass(row.status)}">${esc(row.status)}</span>
      ${row.title ? `<p style="font-size:14px;margin:12px 0 4px">${esc(row.title)}</p>` : ""}
      ${row.copy ? `<p class="copy">${esc(row.copy)}</p>` : ""}
      <div class="caption">From the same pull. A number only shows when Meta returned it.</div>
      ${facts(row)}
      ${row.note ? `<p class="caption">${esc(row.note)}</p>` : ""}
      ${row.purch > 0 && !(row.value > 0) ? `<p class="caption">Meta counted the purchase and did not attach a dollar value.</p>` : ""}
    </div>`;
  $("closeIns").onclick = closeInspector;
}

function closeInspector() {
  state.selected = null;
  const inspector = $("inspector");
  inspector.classList.remove("open");
  inspector.innerHTML = "";
  document.querySelectorAll("#library tbody tr").forEach((tr) => tr.classList.remove("selected"));
}

function render() {
  const rows = visibleRows();
  const concepts = [...new Set(LIBRARY.rows.map((row) => row.concept))].sort();
  const formats = ["Video", "Image", "Carousel"];
  const months = [["all", "All"], ["Month 1", "Month 1"], ["Month 2", "Month 2"]];
  $("metaLine").textContent = `${LIBRARY.range} · ${rows.length} of ${LIBRARY.rows.length} creatives`;
  $("page").innerHTML = `
    <h1>Creative library</h1>
    <p class="lede">Every creative tested in Month 1 and Month 2. Sort the columns, filter the list, and click a row for the copy and the rest of the numbers.</p>
    <div class="filters">
      <input type="search" id="q" placeholder="Search name or copy" value="${esc(state.q)}" />
      ${months.map(([id, label]) => `<button class="chip ${state.month === id ? "active" : ""}" type="button" data-month="${id}">${label}</button>`).join("")}
      <select id="concept">
        <option value="all">All concepts</option>
        ${concepts.map((name) => `<option value="${esc(name)}" ${state.concept === name ? "selected" : ""}>${esc(name)}</option>`).join("")}
      </select>
      <select id="format">
        <option value="all">All formats</option>
        ${formats.map((name) => `<option value="${name}" ${state.format === name ? "selected" : ""}>${name}</option>`).join("")}
      </select>
    </div>
    <div class="table-wrap">
      <table id="library">
        <thead><tr>
          ${sortButton("name", "Creative", false)}
          ${sortButton("reach", "Reach", true)}
          ${sortButton("ctr", "CTR", true)}
          ${sortButton("cpc", "CPC", true)}
          ${sortButton("hook", "Hook", true)}
          ${sortButton("done", "Completion", true)}
        </tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr data-id="${esc(row.id)}" class="${state.selected === row.id ? "selected" : ""}">
              <td>
                <div class="ad-cell">
                  <img class="shot" src="${esc(row.poster)}" alt="" />
                  <div>
                    <div class="name">${esc(row.name)}</div>
                    <div class="sub">${esc(row.month)} · ${esc(row.test)} · ${esc(row.format)}</div>
                  </div>
                </div>
              </td>
              <td class="num">${row.reach ? num(row.reach) : "—"}</td>
              <td class="num">${pct(ctr(row), 2)}</td>
              <td class="num">${money(cpc(row))}</td>
              <td class="num">${pct(hook(row), 1)}</td>
              <td class="num">${pct(done(row), 1)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="caption">${esc(LIBRARY.note)}</p>
  `;
  $("q").addEventListener("input", (event) => {
    state.q = event.target.value;
    const caret = event.target.selectionStart;
    render();
    const box = $("q");
    box.focus();
    box.setSelectionRange(caret, caret);
  });
  $("concept").onchange = (event) => { state.concept = event.target.value; render(); };
  $("format").onchange = (event) => { state.format = event.target.value; render(); };
  document.querySelectorAll("[data-month]").forEach((button) => {
    button.onclick = () => { state.month = button.dataset.month; render(); };
  });
  document.querySelectorAll("[data-sort]").forEach((button) => {
    button.onclick = () => {
      const key = button.dataset.sort;
      if (state.sort === key) state.dir = state.dir === "asc" ? "desc" : "asc";
      else {
        state.sort = key;
        state.dir = key === "name" || key === "cpc" ? "asc" : "desc";
      }
      render();
    };
  });
  document.querySelectorAll("#library tbody tr").forEach((tr) => {
    tr.onclick = () => {
      const row = LIBRARY.rows.find((item) => item.id === tr.dataset.id);
      if (!row) return;
      if (state.selected === row.id) closeInspector();
      else openInspector(row);
    };
  });
  if (state.selected && !rows.some((row) => row.id === state.selected)) closeInspector();
  else if (state.selected) {
    const row = LIBRARY.rows.find((item) => item.id === state.selected);
    if (row) openInspector(row);
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeInspector();
});

fetch("data/library.json")
  .then((response) => response.json())
  .then((data) => {
    LIBRARY = data;
    render();
  })
  .catch(() => {
    $("page").innerHTML = "<h1>Creative library</h1><p class=\"lede\">The library file did not load.</p>";
  });
