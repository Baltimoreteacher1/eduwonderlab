(() => {
  const CATALOG_URL = "/catalog.json";
  const LS_FAV = "ccssHub:fav:v1";
  const LS_REC = "ccssHub:recent:v1";

  const $ = (id) => document.getElementById(id);

  const state = {
    data: null,
    items: [],
    q: "",
    type: "",
    unit: "",
    ccss: "",
    fav: new Set(),
    recent: []
  };

  function hasLocalStorage() {
    try {
      const testKey = "__ccssHub_test__";
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  const storageAvailable = hasLocalStorage();

  function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function loadFav() {
    if (!storageAvailable) return;
    const arr = safeParse(localStorage.getItem(LS_FAV) || "[]", []);
    state.fav = new Set(Array.isArray(arr) ? arr : []);
  }

  function saveFav() {
    if (!storageAvailable) return;
    localStorage.setItem(LS_FAV, JSON.stringify([...state.fav]));
  }

  function loadRecent() {
    if (!storageAvailable) return;
    const arr = safeParse(localStorage.getItem(LS_REC) || "[]", []);
    state.recent = Array.isArray(arr) ? arr : [];
  }

  function pushRecent(url) {
    if (!storageAvailable || !url) return;
    const next = [url, ...state.recent.filter(x => x !== url)].slice(0, 10);
    state.recent = next;
    localStorage.setItem(LS_REC, JSON.stringify(next));
  }

  function norm(s) {
    return String(s || "").toLowerCase().trim();
  }

  function uniqueSorted(arr) {
    return [...new Set(arr.filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }

  function buildFilters() {
    const units = uniqueSorted(
      state.items.map(i => i.unit).filter(u => u && u !== "All")
    );
    const standards = uniqueSorted(
      state.items.flatMap(i => i.ccss || [])
    );

    const unitSel = $("unit");
    unitSel.innerHTML =
      `<option value="">All Units</option>` +
      units.map(u => `<option value="${u}">${u}</option>`).join("");

    const ccssSel = $("ccss");
    ccssSel.innerHTML =
      `<option value="">All CCSS</option>` +
      standards.map(s => `<option value="${s}">${s}</option>`).join("");
  }

  function matches(item, normQ) {
    if (state.type && item.type !== state.type) return false;
    if (state.unit && item.unit !== state.unit) return false;
    if (state.ccss && !(item.ccss || []).includes(state.ccss)) return false;

    if (normQ) {
      const hay = [
        item.title,
        item.type,
        item.unit,
        ...(item.ccss || []),
        ...(item.tags || [])
      ].map(norm).join(" | ");
      if (!hay.includes(normQ)) return false;
    }
    return true;
  }

  function cardHTML(item) {
    const key = item.url;
    const isFav = state.fav.has(key);
    const badge = item.type === "game" ? "GAME" : "RESOURCE";

    const ccssChips = (item.ccss || [])
      .slice(0, 3)
      .map(s => `<span class="chip">${s}</span>`)
      .join("");

    const tagChips = (item.tags || [])
      .slice(0, 3)
      .map(t => `<span class="chip chip-soft">${t}</span>`)
      .join("");

    return `
      <article
        class="card"
        data-url="${item.url}"
        data-type="${item.type}"
        aria-label="${item.title}"
      >
        <button
          class="star ${isFav ? "on" : ""}"
          data-fav="${key}"
          aria-label="Toggle favorite for ${item.title}"
          aria-pressed="${isFav ? "true" : "false"}"
          type="button"
        >
          ★
        </button>
        <div class="badge ${item.type}">${badge}</div>
        <h2 class="title">${item.title}</h2>
        <div class="meta">${item.unit || ""}</div>
        <div class="chips">${ccssChips}${tagChips}</div>
        <p class="launch" aria-hidden="true">Open →</p>
      </article>
    `;
  }

  function render() {
    const app = $("app");
    if (!app) return;

    const normQ = norm(state.q);
    const filtered = state.items.filter(item => matches(item, normQ));

    const recentItems = state.recent
      .map(url => state.items.find(i => i.url === url))
      .filter(Boolean)
      .slice(0, 6);

    let html = "";

    if (recentItems.length) {
      html += `
        <div class="sectionTitle">Recent</div>
        <div class="grid">
          ${recentItems.map(cardHTML).join("")}
        </div>
      `;
    }

    html += `<div class="sectionTitle">All Items (${filtered.length})</div>`;

    if (!filtered.length) {
      html += `
        <div class="empty">
          No matches. Try clearing filters or searching a different keyword.
        </div>
      `;
      app.innerHTML = html;
      return;
    }

    html += `
      <div class="grid">
        ${filtered.map(cardHTML).join("")}
      </div>
    `;

    app.innerHTML = html;
  }

  function handleAppClick(event) {
    const target = event.target;

    // Favorite toggle
    const favBtn = target.closest("button[data-fav]");
    if (favBtn) {
      event.preventDefault();
      event.stopPropagation();
      const key = favBtn.getAttribute("data-fav");
      if (!key) return;

      if (state.fav.has(key)) {
        state.fav.delete(key);
      } else {
        state.fav.add(key);
      }
      saveFav();
      render();
      return;
    }

    // Card navigation
    const card = target.closest(".card");
    if (card && card.dataset.url) {
      const url = card.dataset.url;
      pushRecent(url);
      window.location.href = url;
    }
  }

  function wireControls() {
    const qEl = $("q");
    const typeEl = $("type");
    const unitEl = $("unit");
    const ccssEl = $("ccss");
    const resetBtn = $("resetBtn");
    const app = $("app");

    if (qEl) {
      qEl.addEventListener("input", (e) => {
        state.q = e.target.value;
        render();
      });
    }

    if (typeEl) {
      typeEl.addEventListener("change", (e) => {
        state.type = e.target.value;
        render();
      });
    }

    if (unitEl) {
      unitEl.addEventListener("change", (e) => {
        state.unit = e.target.value;
        render();
      });
    }

    if (ccssEl) {
      ccssEl.addEventListener("change", (e) => {
        state.ccss = e.target.value;
        render();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        state.q = "";
        state.type = "";
        state.unit = "";
        state.ccss = "";

        if (qEl) qEl.value = "";
        if (typeEl) typeEl.value = "";
        if (unitEl) unitEl.value = "";
        if (ccssEl) ccssEl.value = "";

        render();
      });
    }

    if (app) {
      app.addEventListener("click", handleAppClick);
    }
  }

  async function init() {
    loadFav();
    loadRecent();

    const res = await fetch(CATALOG_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Could not load catalog.json (${res.status})`);
    }

    state.data = await res.json();

    const siteTitleEl = $("siteTitle");
    if (siteTitleEl) {
      siteTitleEl.textContent = state.data.siteTitle || "CCSS Hub";
    }

    state.items = (state.data.items || [])
      .map(i => ({
        title: i.title || "Untitled",
        type: i.type || "resource",
        unit: i.unit || "All",
        ccss: Array.isArray(i.ccss) ? i.ccss : [],
        tags: Array.isArray(i.tags) ? i.tags : [],
        url: i.url
      }))
      .filter(i => i.url);

    buildFilters();
    wireControls();
    render();
  }

  init().catch(err => {
    console.error(err);
    const app = $("app");
    if (app) {
      app.innerHTML = `
        <div class="empty">
          Dashboard error: ${err.message}. Please try reloading the page.
        </div>
      `;
    }
  });
})();
