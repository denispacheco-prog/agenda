const CATEGORIA_LABELS = {
  cinema: "Cinema",
  museu: "Museu",
  livraria: "Livraria",
  curso: "Curso",
  feira: "Feira",
  show: "Show",
  balada: "Balada",
  clube: "Clube",
  restaurante: "Restaurante",
  jogos: "Jogos",
};

const CATEGORIA_COLORS = {
  cinema: "#e0575b",
  museu: "#9b59b6",
  livraria: "#d9822b",
  curso: "#2f9e44",
  feira: "#f0b429",
  show: "#4c6ef5",
  balada: "#e64980",
  clube: "#15aabf",
  restaurante: "#c2410c",
  jogos: "#0ca678",
};

const PRECO_LABELS = {
  gratis: "grátis",
  pago: "pago",
};

const VEICULO_PALETTE = ["#4c6ef5", "#e0575b", "#2f9e44", "#9b59b6", "#d9822b", "#0ca678", "#e64980", "#15aabf"];

function hueForVeiculo(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return VEICULO_PALETTE[hash % VEICULO_PALETTE.length];
}

const THEME_KEY = "agenda:theme";
const STATUS_KEY = "agenda:status";
const MANUAL_EVENTOS_KEY = "agenda:eventosManuais";
const EVENTO_EDITS_KEY = "agenda:eventoEdits";
const FEED_SALVOS_KEY = "agenda:feedSalvos";

const state = {
  fontes: [],
  fontesById: new Map(),
  eventos: [],
  filtros: { categoria: "", bairro: "", fonteId: "" },
  viewMode: "feed",
  showDescartados: false,
  calendar: { year: 0, month: 0 },
  selectedDayKey: null,
  veiculos: [],
  veiculosById: new Map(),
  feedItens: [],
  feedSalvos: [],
  feedFiltroVeiculo: "",
  feedSoSalvos: false,
  feedFiltrosVisiveis: false,
  editingEventoId: null,
  editingFonteId: null,
};

// --- localStorage helpers ---

function loadStatusOverlay() {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveStatusOverlay(overlay) {
  localStorage.setItem(STATUS_KEY, JSON.stringify(overlay));
}

function loadManualEventos() {
  try {
    return JSON.parse(localStorage.getItem(MANUAL_EVENTOS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveManualEventos(eventos) {
  localStorage.setItem(MANUAL_EVENTOS_KEY, JSON.stringify(eventos));
}

function loadEventoEdits() {
  try {
    return JSON.parse(localStorage.getItem(EVENTO_EDITS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveEventoEdits(edits) {
  localStorage.setItem(EVENTO_EDITS_KEY, JSON.stringify(edits));
}

function loadFeedSalvos() {
  try {
    return JSON.parse(localStorage.getItem(FEED_SALVOS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveFeedSalvos(ids) {
  localStorage.setItem(FEED_SALVOS_KEY, JSON.stringify(ids));
}

// --- utils ---

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function slugify(str) {
  return str
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function generateEventId(fonteId, dataInicioIso, titulo, existingIds) {
  const dia = dataInicioIso.slice(0, 10);
  const base = `${fonteId}-${dia}-${slugify(titulo)}`;
  let id = base;
  let n = 2;
  while (existingIds.has(id)) {
    id = `${base}-${n}`;
    n++;
  }
  return id;
}

function generateFonteId(nome, existingIds) {
  const base = slugify(nome);
  let id = base;
  let n = 2;
  while (existingIds.has(id)) {
    id = `${base}-${n}`;
    n++;
  }
  return id;
}

function toIsoSp(datetimeLocalValue) {
  return datetimeLocalValue ? `${datetimeLocalValue}:00-03:00` : null;
}

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayLabel(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / 86400000);
  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "amanhã";
  if (diffDays === -1) return "ontem";
  const opts = { day: "2-digit", month: "long" };
  if (d.getFullYear() !== today.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("pt-BR", opts);
}

// --- theme ---

function updateThemeToggleButton() {
  const btn = document.getElementById("theme-toggle");
  const theme = document.documentElement.getAttribute("data-theme");
  btn.textContent = theme === "dark" ? "☾" : "☀";
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
  const meta = document.getElementById("theme-color-meta");
  if (meta) meta.setAttribute("content", next === "dark" ? "#221f1c" : "#ffffff");
  updateThemeToggleButton();
}

// --- triagem ---

async function setStatus(id, status) {
  const evento = state.eventos.find((e) => e.id === id);
  const current = evento ? evento.status : "novo";
  const next = current === status ? "novo" : status;

  if (API.isGithubConfigured()) {
    try {
      await API.saveEventoStatus(id, next);
    } catch (err) {
      alert(err.message);
      return;
    }
  } else {
    const overlay = loadStatusOverlay();
    if (next === "novo") delete overlay[id];
    else overlay[id] = next;
    saveStatusOverlay(overlay);
  }

  if (evento) evento.status = next;
  render();
}

async function removeManualEvento(id) {
  if (API.isGithubConfigured()) {
    try {
      await API.removeEventoGithub(id);
    } catch (err) {
      alert(err.message);
      return;
    }
  } else {
    saveManualEventos(loadManualEventos().filter((e) => e.id !== id));
  }
  state.eventos = state.eventos.filter((e) => e.id !== id);
  render();
}

// --- filtering ---

function getFilteredEventos() {
  return state.eventos.filter((e) => {
    if (state.filtros.categoria && e.categoria !== state.filtros.categoria) return false;
    const fonte = state.fontesById.get(e.fonte_id);
    if (state.filtros.bairro && (!fonte || fonte.bairro !== state.filtros.bairro)) return false;
    if (state.filtros.fonteId && e.fonte_id !== state.filtros.fonteId) return false;
    if (state.viewMode === "salvos") return e.status === "salvo";
    if (!state.showDescartados && e.status === "descartado") return false;
    return true;
  });
}

function countHiddenDescartados() {
  if (state.showDescartados) return 0;
  return state.eventos.filter((e) => {
    if (state.filtros.categoria && e.categoria !== state.filtros.categoria) return false;
    const fonte = state.fontesById.get(e.fonte_id);
    if (state.filtros.bairro && (!fonte || fonte.bairro !== state.filtros.bairro)) return false;
    if (state.filtros.fonteId && e.fonte_id !== state.filtros.fonteId) return false;
    return e.status === "descartado";
  }).length;
}

// --- rendering: shared event card ---

function eventCardHtml(ev) {
  const fonte = state.fontesById.get(ev.fonte_id);
  const hue = CATEGORIA_COLORS[ev.categoria] || "";
  const hora = new Date(ev.data_inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const catLabel = CATEGORIA_LABELS[ev.categoria] || ev.categoria;
  const precoTagHtml = ev.preco && PRECO_LABELS[ev.preco]
    ? `<span class="event-tag event-tag--${escapeHtml(ev.preco)}">${escapeHtml(PRECO_LABELS[ev.preco])}</span>`
    : "";
  const tituloHtml = ev.url
    ? `<a href="${escapeHtml(ev.url)}" target="_blank" rel="noopener">${escapeHtml(ev.titulo)}</a>`
    : escapeHtml(ev.titulo);
  const descricaoHtml = ev.descricao ? `<p class="event-descricao">${escapeHtml(ev.descricao)}</p>` : "";
  const removerHtml = ev.origem === "manual"
    ? `<button type="button" class="event-remover" data-remove-id="${escapeHtml(ev.id)}">remover</button>`
    : "";

  return `
    <article class="event-card${ev.status === "descartado" ? " is-descartado" : ""}" style="--cat-hue:${hue}">
      <div class="event-card-top">
        <span class="event-categoria">${escapeHtml(catLabel)}</span>
        ${precoTagHtml}
        <span class="event-hora">${hora}</span>
      </div>
      <h3 class="event-titulo">${tituloHtml}</h3>
      <div class="event-meta">${escapeHtml(fonte ? fonte.nome : ev.fonte_id)}${fonte && fonte.bairro ? " · " + escapeHtml(fonte.bairro) : ""}${fonte && fonte.subcategoria ? " · " + escapeHtml(fonte.subcategoria) : ""}</div>
      ${descricaoHtml}
      <div class="triagem" data-event-id="${escapeHtml(ev.id)}">
        <button type="button" class="triagem-btn${ev.status === "interesse" ? " is-active" : ""}" data-status="interesse">interesse</button>
        <button type="button" class="triagem-btn${ev.status === "salvo" ? " is-active" : ""}" data-status="salvo">salvo</button>
        <button type="button" class="triagem-btn${ev.status === "descartado" ? " is-active" : ""}" data-status="descartado">descartar</button>
        <button type="button" class="event-editar" data-edit-id="${escapeHtml(ev.id)}">editar</button>
        ${removerHtml}
      </div>
    </article>`;
}

function attachCardListeners(container) {
  container.querySelectorAll(".triagem-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".triagem").dataset.eventId;
      setStatus(id, btn.dataset.status);
    });
  });
  container.querySelectorAll(".event-remover").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("remover este evento adicionado manualmente?")) {
        removeManualEvento(btn.dataset.removeId);
      }
    });
  });
  container.querySelectorAll(".event-editar").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ev = state.eventos.find((e) => e.id === btn.dataset.editId);
      if (ev) abrirFormularioEdicaoEvento(ev);
    });
  });
}

// --- rendering: lista ---

function renderLista(container, eventos, isSalvosView) {
  const sorted = [...eventos].sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));

  if (sorted.length === 0) {
    container.innerHTML = `<p class="empty-state">${
      isSalvosView ? "nenhum evento salvo ainda." : "nenhum evento com esses filtros."
    }</p>`;
    return;
  }

  let html = "";
  let lastLabel = null;
  sorted.forEach((ev) => {
    const label = dayLabel(new Date(ev.data_inicio));
    if (label !== lastLabel) {
      html += `<h2 class="stream-date-heading">${label}</h2>`;
      lastLabel = label;
    }
    html += eventCardHtml(ev);
  });

  if (!isSalvosView) {
    const hidden = countHiddenDescartados();
    if (hidden > 0 || state.showDescartados) {
      html += `<button type="button" class="toggle-descartados" id="toggle-descartados">${
        state.showDescartados ? "ocultar descartados" : `mostrar descartados (${hidden})`
      }</button>`;
    }
  }

  container.innerHTML = html;

  const toggleBtn = document.getElementById("toggle-descartados");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      state.showDescartados = !state.showDescartados;
      render();
    });
  }

  attachCardListeners(container);
}

// --- rendering: calendário ---

function shiftMonth(delta) {
  state.calendar.month += delta;
  if (state.calendar.month < 0) {
    state.calendar.month = 11;
    state.calendar.year--;
  } else if (state.calendar.month > 11) {
    state.calendar.month = 0;
    state.calendar.year++;
  }
  state.selectedDayKey = null;
  render();
}

function renderCalendarDetail(eventosByDay) {
  const detail = document.getElementById("calendar-detail");
  if (!state.selectedDayKey) {
    detail.innerHTML = "";
    return;
  }
  const dayEventos = (eventosByDay.get(state.selectedDayKey) || [])
    .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
  const label = new Date(`${state.selectedDayKey}T00:00:00-03:00`)
    .toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  if (dayEventos.length === 0) {
    detail.innerHTML = `<h3>${label}</h3><p class="empty-state">nenhum evento neste dia.</p>`;
    return;
  }
  detail.innerHTML = `<h3>${label}</h3>` + dayEventos.map(eventCardHtml).join("");
  attachCardListeners(detail);
}

function renderCalendario(container, eventos) {
  const { year, month } = state.calendar;
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const gridStart = new Date(year, month, 1 - startWeekday);
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  const eventosByDay = new Map();
  eventos.forEach((ev) => {
    const key = ev.data_inicio.slice(0, 10);
    if (!eventosByDay.has(key)) eventosByDay.set(key, []);
    eventosByDay.get(key).push(ev);
  });

  const monthLabel = firstOfMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const todayKey = dateKey(new Date());
  const maxVisivelPorDia = window.matchMedia("(max-width: 600px)").matches ? 1 : 3;

  let html = `
    <div class="calendar-nav">
      <button type="button" class="btn" id="cal-prev">‹</button>
      <h2>${monthLabel}</h2>
      <button type="button" class="btn" id="cal-next">›</button>
    </div>
    <div class="calendar-grid">`;

  ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].forEach((w) => {
    html += `<div class="calendar-weekday">${w}</div>`;
  });

  for (let i = 0; i < totalCells; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const key = dateKey(d);
    const dayEventos = eventosByDay.get(key) || [];
    const classes = ["calendar-day"];
    if (d.getMonth() !== month) classes.push("is-outside");
    if (key === todayKey) classes.push("is-today");
    if (key === state.selectedDayKey) classes.push("is-selected");

    const dayEventosOrdenados = [...dayEventos].sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
    let titulosHtml = "";
    dayEventosOrdenados.slice(0, maxVisivelPorDia).forEach((ev) => {
      const hue = CATEGORIA_COLORS[ev.categoria] || "";
      titulosHtml += `<div class="calendar-day-event" style="--cat-hue:${hue}"><span class="calendar-day-event-dot"></span><span class="calendar-day-event-title">${escapeHtml(ev.titulo)}</span></div>`;
    });
    const restantes = dayEventosOrdenados.length - maxVisivelPorDia;
    const more = restantes > 0 ? `<div class="calendar-day-more">+${restantes} mais</div>` : "";

    html += `<div class="${classes.join(" ")}" data-day-key="${key}">
      <div class="calendar-day-number">${d.getDate()}</div>
      <div class="calendar-day-events">${titulosHtml}${more}</div>
    </div>`;
  }

  html += `</div><div class="calendar-detail" id="calendar-detail"></div>`;
  container.innerHTML = html;

  document.getElementById("cal-prev").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("cal-next").addEventListener("click", () => shiftMonth(1));
  container.querySelectorAll(".calendar-day").forEach((cell) => {
    cell.addEventListener("click", () => {
      state.selectedDayKey = cell.dataset.dayKey === state.selectedDayKey ? null : cell.dataset.dayKey;
      render();
    });
  });

  renderCalendarDetail(eventosByDay);
}

// --- rendering: feed ---

async function toggleFeedSalvo(item) {
  const isSalvo = state.feedSalvos.some((i) => i.id === item.id);

  if (API.isGithubConfigured()) {
    try {
      state.feedSalvos = isSalvo
        ? await API.removeFeedItemGithub(item.id)
        : await API.saveFeedItemGithub(item);
    } catch (err) {
      alert(err.message);
      return;
    }
  } else {
    const salvos = loadFeedSalvos();
    const idx = salvos.indexOf(item.id);
    if (idx === -1) salvos.push(item.id);
    else salvos.splice(idx, 1);
    saveFeedSalvos(salvos);
    state.feedSalvos = state.feedItens.filter((it) => salvos.includes(it.id));
  }

  render();
}

function filterFeedItens(items) {
  return items.filter((item) => !state.feedFiltroVeiculo || item.veiculo_id === state.feedFiltroVeiculo);
}

function feedItemHtml(item, salvosSet) {
  const veiculo = state.veiculosById.get(item.veiculo_id);
  const hue = hueForVeiculo(item.veiculo_id);
  const hora = new Date(item.publicado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const isSalvo = salvosSet.has(item.id);
  const resumoHtml = item.resumo ? `<p class="feed-item-summary">${escapeHtml(item.resumo)}</p>` : "";

  return `
    <article class="feed-item">
      <div class="feed-item-meta">
        <span class="feed-item-source" style="--cat-hue:${hue}">${escapeHtml(veiculo ? veiculo.nome : item.veiculo_id)}</span>
        <span class="feed-item-date">${hora}</span>
        <button type="button" class="feed-save-btn${isSalvo ? " is-saved" : ""}" data-feed-id="${escapeHtml(item.id)}" aria-label="${isSalvo ? "remover dos salvos" : "salvar"}" title="${isSalvo ? "salvo" : "salvar"}">${isSalvo ? "★" : "☆"}</button>
      </div>
      <h3 class="feed-item-title"><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.titulo)}</a></h3>
      ${resumoHtml}
    </article>`;
}

function renderFeed(container) {
  const salvosSet = new Set(state.feedSalvos.map((i) => i.id));
  const source = state.feedSoSalvos ? state.feedSalvos : state.feedItens;
  const filtered = filterFeedItens(source).sort((a, b) => b.publicado_em.localeCompare(a.publicado_em));

  const veiculosFeed = state.veiculos.filter((v) => v.tipo_coleta === "feed");
  const veiculosManuais = state.veiculos.filter((v) => v.tipo_coleta !== "feed");

  const filtrosResumo = [];
  if (state.feedFiltroVeiculo) {
    const v = state.veiculosById.get(state.feedFiltroVeiculo);
    filtrosResumo.push(v ? v.nome : state.feedFiltroVeiculo);
  }
  if (state.feedSoSalvos) filtrosResumo.push("só salvos");

  const toggleFiltrosLabel = state.feedFiltrosVisiveis
    ? "ocultar filtros"
    : filtrosResumo.length > 0
    ? `filtros: ${filtrosResumo.join(", ")}`
    : "filtros";

  const filterBarHtml = `
    <button type="button" class="toggle-descartados" id="feed-toggle-filtros">${escapeHtml(toggleFiltrosLabel)}</button>
    ${state.feedFiltrosVisiveis ? `
    <div class="feed-filterbar">
      <select id="feed-filtro-veiculo">
        <option value="">todos os veículos</option>
        ${veiculosFeed.map((v) => `<option value="${escapeHtml(v.id)}"${state.feedFiltroVeiculo === v.id ? " selected" : ""}>${escapeHtml(v.nome)}</option>`).join("")}
      </select>
      <button type="button" class="btn${state.feedSoSalvos ? " btn-primary" : ""}" id="feed-toggle-salvos">${state.feedSoSalvos ? "mostrando só salvos" : "só salvos"}</button>
    </div>` : ""}`;

  let itemsHtml = "";
  if (filtered.length === 0) {
    itemsHtml = `<p class="empty-state">${state.feedSoSalvos ? "nenhum item salvo ainda." : "nenhum item no feed ainda."}</p>`;
  } else {
    let lastLabel = null;
    filtered.forEach((item) => {
      const label = dayLabel(new Date(item.publicado_em));
      if (label !== lastLabel) {
        itemsHtml += `<h2 class="stream-date-heading">${label}</h2>`;
        lastLabel = label;
      }
      itemsHtml += feedItemHtml(item, salvosSet);
    });
  }

  let linksHtml = "";
  if (veiculosManuais.length > 0) {
    linksHtml = `
      <div class="feed-links-panel">
        <h3>outros veículos (sem coleta automática)</h3>
        <ul class="feed-links-list">
          ${veiculosManuais.map((v) => `<li><a href="${escapeHtml(v.url)}" target="_blank" rel="noopener">${escapeHtml(v.nome)}</a></li>`).join("")}
        </ul>
      </div>`;
  }

  container.innerHTML = filterBarHtml + itemsHtml + linksHtml;

  document.getElementById("feed-toggle-filtros").addEventListener("click", () => {
    state.feedFiltrosVisiveis = !state.feedFiltrosVisiveis;
    render();
  });
  const selFiltroVeiculo = document.getElementById("feed-filtro-veiculo");
  if (selFiltroVeiculo) {
    selFiltroVeiculo.addEventListener("change", (e) => {
      state.feedFiltroVeiculo = e.target.value;
      render();
    });
  }
  const btnToggleSalvos = document.getElementById("feed-toggle-salvos");
  if (btnToggleSalvos) {
    btnToggleSalvos.addEventListener("click", () => {
      state.feedSoSalvos = !state.feedSoSalvos;
      render();
    });
  }
  container.querySelectorAll(".feed-save-btn[data-feed-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.feedId;
      const item = state.feedItens.find((i) => i.id === id) || state.feedSalvos.find((i) => i.id === id);
      if (item) toggleFeedSalvo(item);
    });
  });
}

// --- rendering: lugares ---

function countEventosFuturos(fonteId) {
  const agora = new Date();
  return state.eventos.filter((e) => {
    return e.fonte_id === fonteId && e.status !== "descartado" && new Date(e.data_inicio) >= agora;
  }).length;
}

function irParaListaDoLugar(fonteId) {
  state.filtros = { categoria: "", bairro: "", fonteId };
  state.viewMode = "lista";
  render();
}

function lugarCardHtml(f) {
  const hue = CATEGORIA_COLORS[f.categoria] || "";
  const subcategoriaHtml = f.subcategoria
    ? `<div class="lugar-subcategoria">${escapeHtml(f.subcategoria)}</div>`
    : "";
  const bairroHtml = f.bairro ? `<div class="lugar-bairro">${escapeHtml(f.bairro)}</div>` : "";
  const siteHtml = f.url
    ? `<a class="lugar-site" href="${escapeHtml(f.url)}" target="_blank" rel="noopener">site ↗</a>`
    : "";
  const count = countEventosFuturos(f.id);
  const contagemLabel = count > 0
    ? `${count} evento${count > 1 ? "s" : ""} futuro${count > 1 ? "s" : ""}`
    : "nenhum evento futuro";

  return `
    <article class="lugar-card" style="--cat-hue:${hue}">
      ${subcategoriaHtml}
      <h3 class="lugar-nome"><button type="button" class="lugar-nome-btn" data-fonte-id="${escapeHtml(f.id)}">${escapeHtml(f.nome)}</button></h3>
      ${bairroHtml}
      <div class="lugar-card-bottom">
        <button type="button" class="lugar-contagem-btn${count > 0 ? " is-active" : ""}" data-fonte-id="${escapeHtml(f.id)}">${contagemLabel}</button>
        ${siteHtml}
      </div>
      <div class="lugar-card-actions">
        <button type="button" class="lugar-editar-btn" data-fonte-id="${escapeHtml(f.id)}">editar</button>
        <button type="button" class="lugar-remover-btn" data-fonte-id="${escapeHtml(f.id)}">remover</button>
      </div>
    </article>`;
}

function renderLugares(container) {
  const filtered = state.fontes.filter((f) => {
    if (state.filtros.categoria && f.categoria !== state.filtros.categoria) return false;
    if (state.filtros.bairro && f.bairro !== state.filtros.bairro) return false;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p class="empty-state">nenhum lugar com esses filtros.</p>`;
    return;
  }

  const categorias = [...new Set(filtered.map((f) => f.categoria))]
    .sort((a, b) => (CATEGORIA_LABELS[a] || a).localeCompare(CATEGORIA_LABELS[b] || b, "pt-BR"));

  let html = "";
  categorias.forEach((cat) => {
    const doGrupo = filtered
      .filter((f) => f.categoria === cat)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    html += `<h2 class="stream-date-heading">${escapeHtml(CATEGORIA_LABELS[cat] || cat)}</h2>`;
    html += `<div class="lugares-grid">`;
    doGrupo.forEach((f) => { html += lugarCardHtml(f); });
    html += `</div>`;
  });

  container.innerHTML = html;

  container.querySelectorAll(".lugar-nome-btn, .lugar-contagem-btn").forEach((btn) => {
    btn.addEventListener("click", () => irParaListaDoLugar(btn.dataset.fonteId));
  });
  container.querySelectorAll(".lugar-editar-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const f = state.fontesById.get(btn.dataset.fonteId);
      if (f) abrirFormularioEdicaoLugar(f);
    });
  });
  container.querySelectorAll(".lugar-remover-btn").forEach((btn) => {
    btn.addEventListener("click", () => removerLugar(btn.dataset.fonteId));
  });
}

// --- lugares: adicionar / editar / remover ---

function abrirFormularioNovoLugar() {
  if (!API.isGithubConfigured()) {
    alert('configure a sincronização com GitHub em "🔑" pra adicionar lugares.');
    return;
  }
  const panel = document.getElementById("form-lugar");
  state.editingFonteId = null;
  panel.reset();
  document.getElementById("form-lugar-titulo").textContent = "adicionar lugar";
  document.getElementById("form-lugar-submit-btn").textContent = "salvar lugar";
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function abrirFormularioEdicaoLugar(f) {
  if (!API.isGithubConfigured()) {
    alert('configure a sincronização com GitHub em "🔑" pra editar lugares.');
    return;
  }
  const panel = document.getElementById("form-lugar");
  state.editingFonteId = f.id;
  document.getElementById("form-lugar-nome").value = f.nome;
  document.getElementById("form-lugar-categoria").value = f.categoria;
  document.getElementById("form-lugar-bairro").value = f.bairro || "";
  document.getElementById("form-lugar-subcategoria").value = f.subcategoria || "";
  document.getElementById("form-lugar-url").value = f.url || "";
  document.getElementById("form-lugar-titulo").textContent = "editar lugar";
  document.getElementById("form-lugar-submit-btn").textContent = "salvar alterações";
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fecharFormularioLugar() {
  const panel = document.getElementById("form-lugar");
  state.editingFonteId = null;
  panel.reset();
  panel.hidden = true;
}

async function removerLugar(fonteId) {
  if (!API.isGithubConfigured()) {
    alert('configure a sincronização com GitHub em "🔑" pra remover lugares.');
    return;
  }
  const fonte = state.fontesById.get(fonteId);
  const nome = fonte ? fonte.nome : fonteId;
  const qtdEventos = state.eventos.filter((e) => e.fonte_id === fonteId).length;
  const aviso = qtdEventos > 0
    ? ` isso não apaga os ${qtdEventos} evento${qtdEventos > 1 ? "s" : ""} já cadastrado${qtdEventos > 1 ? "s" : ""} nesse lugar.`
    : "";
  if (!confirm(`remover "${nome}"?${aviso}`)) return;

  try {
    state.fontes = await API.removeFonteGithub(fonteId);
  } catch (err) {
    alert(err.message);
    return;
  }
  state.fontesById = new Map(state.fontes.map((f) => [f.id, f]));
  render();
}

function setupFormLugar() {
  const panel = document.getElementById("form-lugar");
  const selCategoria = document.getElementById("form-lugar-categoria");

  Object.keys(CATEGORIA_LABELS)
    .sort((a, b) => CATEGORIA_LABELS[a].localeCompare(CATEGORIA_LABELS[b], "pt-BR"))
    .forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = CATEGORIA_LABELS[c];
      selCategoria.appendChild(opt);
    });

  document.getElementById("btn-add-lugar").addEventListener("click", abrirFormularioNovoLugar);
  document.getElementById("btn-cancel-lugar").addEventListener("click", fecharFormularioLugar);

  panel.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nome = document.getElementById("form-lugar-nome").value.trim();
    const categoria = selCategoria.value;
    const bairro = document.getElementById("form-lugar-bairro").value.trim();
    const subcategoria = document.getElementById("form-lugar-subcategoria").value.trim();
    const url = document.getElementById("form-lugar-url").value.trim();

    if (!nome || !categoria) return;

    if (state.editingFonteId) {
      const original = state.fontesById.get(state.editingFonteId);
      const fonteAtualizada = {
        ...original,
        nome,
        categoria,
        bairro: bairro || null,
        subcategoria: subcategoria || null,
        url: url || null,
      };
      try {
        state.fontes = await API.updateFonteGithub(fonteAtualizada);
      } catch (err) {
        alert(err.message);
        return;
      }
    } else {
      const existingIds = new Set(state.fontes.map((f) => f.id));
      const novaFonte = {
        id: generateFonteId(nome, existingIds),
        nome,
        categoria,
        bairro: bairro || null,
        latitude: null,
        longitude: null,
        url: url || null,
        tipo_coleta: "manual",
        feed_url: null,
        subcategoria: subcategoria || null,
      };
      try {
        state.fontes = await API.addFonteGithub(novaFonte);
      } catch (err) {
        alert(err.message);
        return;
      }
    }

    state.fontesById = new Map(state.fontes.map((f) => [f.id, f]));
    fecharFormularioLugar();
    render();
  });
}

// --- render dispatch ---

function syncFiltrosUI() {
  const selCategoria = document.getElementById("filtro-categoria");
  const selBairro = document.getElementById("filtro-bairro");
  const selFonte = document.getElementById("filtro-fonte");
  if (selCategoria) selCategoria.value = state.filtros.categoria;
  if (selBairro) selBairro.value = state.filtros.bairro;
  if (selFonte) selFonte.value = state.filtros.fonteId;
}

function updateActiveViewTab() {
  document.querySelectorAll(".view-tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === state.viewMode);
  });
  const isFeed = state.viewMode === "feed";
  const isLugares = state.viewMode === "lugares";
  document.getElementById("filtros-eventos").hidden = isFeed;
  document.getElementById("filtro-fonte").hidden = isLugares;
  document.getElementById("btn-add-evento").hidden = isFeed || isLugares;
  document.getElementById("btn-add-lugar").hidden = !isLugares;
}

function render() {
  updateActiveViewTab();
  syncFiltrosUI();
  const container = document.getElementById("conteudo");
  if (state.viewMode === "feed") {
    renderFeed(container);
    return;
  }
  if (state.viewMode === "lugares") {
    renderLugares(container);
    return;
  }
  const filtered = getFilteredEventos();
  if (state.viewMode === "calendario") {
    renderCalendario(container, filtered);
  } else {
    renderLista(container, filtered, state.viewMode === "salvos");
  }
}

// --- setup ---

function setupViewTabs() {
  document.querySelectorAll(".view-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.viewMode = btn.dataset.view;
      state.selectedDayKey = null;
      render();
    });
  });
}

function setupFiltros() {
  const categorias = [...new Set(state.fontes.map((f) => f.categoria))]
    .sort((a, b) => (CATEGORIA_LABELS[a] || a).localeCompare(CATEGORIA_LABELS[b] || b, "pt-BR"));
  const bairros = [...new Set(state.fontes.map((f) => f.bairro).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const fontesOrdenadas = [...state.fontes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const selCategoria = document.getElementById("filtro-categoria");
  categorias.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = CATEGORIA_LABELS[c] || c;
    selCategoria.appendChild(opt);
  });

  const selBairro = document.getElementById("filtro-bairro");
  bairros.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    selBairro.appendChild(opt);
  });

  const selFonte = document.getElementById("filtro-fonte");
  fontesOrdenadas.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.nome;
    selFonte.appendChild(opt);
  });

  selCategoria.addEventListener("change", () => { state.filtros.categoria = selCategoria.value; render(); });
  selBairro.addEventListener("change", () => { state.filtros.bairro = selBairro.value; render(); });
  selFonte.addEventListener("change", () => { state.filtros.fonteId = selFonte.value; render(); });
}

function abrirFormularioEdicaoEvento(ev) {
  const panel = document.getElementById("form-add-evento");
  state.editingEventoId = ev.id;
  document.getElementById("form-fonte").value = ev.fonte_id;
  document.getElementById("form-titulo").value = ev.titulo;
  document.getElementById("form-inicio").value = ev.data_inicio ? ev.data_inicio.slice(0, 16) : "";
  document.getElementById("form-fim").value = ev.data_fim ? ev.data_fim.slice(0, 16) : "";
  document.getElementById("form-preco").value = ev.preco || "";
  document.getElementById("form-url").value = ev.url || "";
  document.getElementById("form-descricao").value = ev.descricao || "";
  document.getElementById("form-evento-titulo").textContent = "editar evento";
  document.getElementById("form-evento-submit-btn").textContent = "salvar alterações";
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fecharFormularioEvento() {
  const panel = document.getElementById("form-add-evento");
  state.editingEventoId = null;
  panel.reset();
  panel.hidden = true;
  document.getElementById("form-evento-titulo").textContent = "adicionar evento manualmente";
  document.getElementById("form-evento-submit-btn").textContent = "salvar evento";
}

function setupForm() {
  const panel = document.getElementById("form-add-evento");
  const formFonte = document.getElementById("form-fonte");

  [...state.fontes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.nome;
    formFonte.appendChild(opt);
  });

  document.getElementById("btn-add-evento").addEventListener("click", () => {
    if (panel.hidden) {
      state.editingEventoId = null;
      panel.reset();
      document.getElementById("form-evento-titulo").textContent = "adicionar evento manualmente";
      document.getElementById("form-evento-submit-btn").textContent = "salvar evento";
      panel.hidden = false;
    } else {
      fecharFormularioEvento();
    }
  });

  document.getElementById("btn-cancel-evento").addEventListener("click", fecharFormularioEvento);

  panel.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fonteId = formFonte.value;
    const fonte = state.fontesById.get(fonteId);
    const titulo = document.getElementById("form-titulo").value.trim();
    const inicioRaw = document.getElementById("form-inicio").value;
    const fimRaw = document.getElementById("form-fim").value;
    const preco = document.getElementById("form-preco").value;
    const url = document.getElementById("form-url").value.trim();
    const descricao = document.getElementById("form-descricao").value.trim();

    if (!fonte || !titulo || !inicioRaw) return;

    const dataInicio = toIsoSp(inicioRaw);

    if (state.editingEventoId) {
      const id = state.editingEventoId;
      const original = state.eventos.find((ev) => ev.id === id);
      const eventoAtualizado = {
        ...original,
        titulo,
        data_inicio: dataInicio,
        data_fim: toIsoSp(fimRaw),
        fonte_id: fonteId,
        categoria: fonte.categoria,
        preco: preco || null,
        url: url || null,
        descricao,
      };

      if (API.isGithubConfigured()) {
        try {
          state.eventos = await API.updateEventoGithub(eventoAtualizado);
        } catch (err) {
          alert(err.message);
          return;
        }
      } else {
        const manuais = loadManualEventos();
        const idxManual = manuais.findIndex((m) => m.id === id);
        if (idxManual !== -1) {
          manuais[idxManual] = eventoAtualizado;
          saveManualEventos(manuais);
        } else {
          const edits = loadEventoEdits();
          edits[id] = {
            titulo,
            data_inicio: dataInicio,
            data_fim: toIsoSp(fimRaw),
            fonte_id: fonteId,
            categoria: fonte.categoria,
            preco: preco || null,
            url: url || null,
            descricao,
          };
          saveEventoEdits(edits);
        }
        state.eventos = state.eventos.map((ev) => (ev.id === id ? eventoAtualizado : ev));
      }

      fecharFormularioEvento();
      render();
      return;
    }

    const existingIds = new Set(state.eventos.map((ev) => ev.id));

    const novoEvento = {
      id: generateEventId(fonteId, dataInicio, titulo, existingIds),
      titulo,
      data_inicio: dataInicio,
      data_fim: toIsoSp(fimRaw),
      fonte_id: fonteId,
      categoria: fonte.categoria,
      preco: preco || null,
      url: url || null,
      descricao,
      status: "novo",
      origem: "manual",
      criado_em: new Date().toISOString(),
    };

    if (API.isGithubConfigured()) {
      try {
        // addManualEventoGithub pode renomear o id se houver colisão contra
        // os dados mais recentes do GitHub — usa o array retornado como
        // fonte da verdade em vez de empurrar novoEvento cegamente.
        state.eventos = await API.addManualEventoGithub(novoEvento);
      } catch (err) {
        alert(err.message);
        return;
      }
    } else {
      const manuais = loadManualEventos();
      manuais.push(novoEvento);
      saveManualEventos(manuais);
      state.eventos.push(novoEvento);
    }

    panel.reset();
    panel.hidden = true;
    render();
  });
}

// --- sincronização com GitHub ---

function updateGithubConfigButton() {
  const btn = document.getElementById("github-config-btn");
  const configured = API.isGithubConfigured();
  btn.classList.toggle("is-active", configured);
  btn.title = configured
    ? "sincronização com GitHub ativada — clique pra trocar ou remover o token"
    : "configurar token do GitHub pra sincronizar entre navegadores";
}

async function loadEventosState() {
  if (API.isGithubConfigured()) {
    state.eventos = await API.loadEventosGithub();
    return;
  }
  const eventosBase = await API.loadEventos();
  const manuais = loadManualEventos();
  const statusOverlay = loadStatusOverlay();
  const editsOverlay = loadEventoEdits();
  state.eventos = [...eventosBase, ...manuais].map((e) => ({
    ...e,
    ...(editsOverlay[e.id] || {}),
    status: statusOverlay[e.id] || e.status || "novo",
  }));
}

async function loadFeedSalvosState() {
  if (API.isGithubConfigured()) {
    state.feedSalvos = await API.loadFeedSalvosGithub();
    return;
  }
  const savedIds = loadFeedSalvos();
  state.feedSalvos = state.feedItens.filter((item) => savedIds.includes(item.id));
}

async function handleGithubConfig() {
  const token = window.prompt(
    'cole seu Personal Access Token do GitHub (permissão de leitura/escrita de conteúdo no repositório "agenda"). deixe em branco e confirme pra remover a sincronização deste navegador.'
  );
  if (token === null) return;

  API.configureGithubToken(token.trim());
  updateGithubConfigButton();

  try {
    await loadEventosState();
    await loadFeedSalvosState();
  } catch (err) {
    alert(err.message);
  }
  render();
}

async function init() {
  updateThemeToggleButton();
  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
  document.getElementById("github-config-btn").addEventListener("click", handleGithubConfig);
  updateGithubConfigButton();

  try {
    const fontes = await API.loadFontes();
    state.fontes = fontes;
    fontes.forEach((f) => state.fontesById.set(f.id, f));

    await loadEventosState();

    const now = new Date();
    state.calendar.year = now.getFullYear();
    state.calendar.month = now.getMonth();

    setupFiltros();
    setupViewTabs();
    setupForm();
    setupFormLugar();
  } catch (err) {
    document.getElementById("conteudo").innerHTML =
      `<p class="empty-state">não foi possível carregar a Agenda: ${escapeHtml(err.message)}</p>`;
    return;
  }

  try {
    const [veiculos, feedItens] = await Promise.all([API.loadVeiculos(), API.loadFeed()]);
    state.veiculos = veiculos;
    veiculos.forEach((v) => state.veiculosById.set(v.id, v));
    state.feedItens = feedItens;
    await loadFeedSalvosState();
  } catch (err) {
    console.error("[agenda] falha ao carregar o feed:", err.message);
  }

  render();
}

document.addEventListener("DOMContentLoaded", init);
