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

const THEME_KEY = "agenda:theme";
const STATUS_KEY = "agenda:status";
const MANUAL_EVENTOS_KEY = "agenda:eventosManuais";

const state = {
  fontes: [],
  fontesById: new Map(),
  eventos: [],
  filtros: { categoria: "", bairro: "", fonteId: "" },
  viewMode: "lista",
  showDescartados: false,
  calendar: { year: 0, month: 0 },
  selectedDayKey: null,
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
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Amanhã";
  if (diffDays === -1) return "Ontem";
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

function setStatus(id, status) {
  const overlay = loadStatusOverlay();
  const evento = state.eventos.find((e) => e.id === id);
  const current = evento ? evento.status : "novo";
  const next = current === status ? "novo" : status;

  if (next === "novo") delete overlay[id];
  else overlay[id] = next;
  saveStatusOverlay(overlay);

  if (evento) evento.status = next;
  render();
}

function removeManualEvento(id) {
  saveManualEventos(loadManualEventos().filter((e) => e.id !== id));
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
        <span class="event-hora">${hora}</span>
      </div>
      <h3 class="event-titulo">${tituloHtml}</h3>
      <div class="event-meta">${escapeHtml(fonte ? fonte.nome : ev.fonte_id)}${fonte && fonte.bairro ? " · " + escapeHtml(fonte.bairro) : ""}${fonte && fonte.subcategoria ? " · " + escapeHtml(fonte.subcategoria) : ""}</div>
      ${descricaoHtml}
      <div class="triagem" data-event-id="${escapeHtml(ev.id)}">
        <button type="button" class="triagem-btn${ev.status === "interesse" ? " is-active" : ""}" data-status="interesse">Interesse</button>
        <button type="button" class="triagem-btn${ev.status === "salvo" ? " is-active" : ""}" data-status="salvo">Salvo</button>
        <button type="button" class="triagem-btn${ev.status === "descartado" ? " is-active" : ""}" data-status="descartado">Descartar</button>
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
      if (confirm("Remover este evento adicionado manualmente?")) {
        removeManualEvento(btn.dataset.removeId);
      }
    });
  });
}

// --- rendering: lista ---

function renderLista(container, eventos, isSalvosView) {
  const sorted = [...eventos].sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));

  if (sorted.length === 0) {
    container.innerHTML = `<p class="empty-state">${
      isSalvosView ? "Nenhum evento salvo ainda." : "Nenhum evento encontrado com esses filtros."
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
        state.showDescartados ? "Ocultar descartados" : `Mostrar descartados (${hidden})`
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
    detail.innerHTML = `<h3>${label}</h3><p class="empty-state">Nenhum evento neste dia.</p>`;
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

  let html = `
    <div class="calendar-nav">
      <button type="button" class="btn" id="cal-prev">‹</button>
      <h2>${monthLabel}</h2>
      <button type="button" class="btn" id="cal-next">›</button>
    </div>
    <div class="calendar-grid">`;

  ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].forEach((w) => {
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

    let dots = "";
    dayEventos.slice(0, 4).forEach((ev) => {
      dots += `<span class="calendar-day-dot" style="--cat-hue:${CATEGORIA_COLORS[ev.categoria] || ""}"></span>`;
    });
    const more = dayEventos.length > 4 ? `<div class="calendar-day-more">+${dayEventos.length - 4}</div>` : "";

    html += `<div class="${classes.join(" ")}" data-day-key="${key}">
      <div class="calendar-day-number">${d.getDate()}</div>
      <div>${dots}</div>
      ${more}
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

// --- render dispatch ---

function updateActiveViewTab() {
  document.querySelectorAll(".view-tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === state.viewMode);
  });
}

function render() {
  updateActiveViewTab();
  const filtered = getFilteredEventos();
  const container = document.getElementById("conteudo");
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
    panel.hidden = !panel.hidden;
  });

  document.getElementById("btn-cancel-evento").addEventListener("click", () => {
    panel.reset();
    panel.hidden = true;
  });

  panel.addEventListener("submit", (e) => {
    e.preventDefault();

    const fonteId = formFonte.value;
    const fonte = state.fontesById.get(fonteId);
    const titulo = document.getElementById("form-titulo").value.trim();
    const inicioRaw = document.getElementById("form-inicio").value;
    const fimRaw = document.getElementById("form-fim").value;
    const url = document.getElementById("form-url").value.trim();
    const descricao = document.getElementById("form-descricao").value.trim();

    if (!fonte || !titulo || !inicioRaw) return;

    const dataInicio = toIsoSp(inicioRaw);
    const existingIds = new Set(state.eventos.map((ev) => ev.id));

    const novoEvento = {
      id: generateEventId(fonteId, dataInicio, titulo, existingIds),
      titulo,
      data_inicio: dataInicio,
      data_fim: toIsoSp(fimRaw),
      fonte_id: fonteId,
      categoria: fonte.categoria,
      url: url || null,
      descricao,
      status: "novo",
      origem: "manual",
      criado_em: new Date().toISOString(),
    };

    const manuais = loadManualEventos();
    manuais.push(novoEvento);
    saveManualEventos(manuais);
    state.eventos.push(novoEvento);

    panel.reset();
    panel.hidden = true;
    render();
  });
}

async function init() {
  updateThemeToggleButton();
  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);

  try {
    const [fontes, eventosBase] = await Promise.all([API.loadFontes(), API.loadEventos()]);
    state.fontes = fontes;
    fontes.forEach((f) => state.fontesById.set(f.id, f));

    const manuais = loadManualEventos();
    const statusOverlay = loadStatusOverlay();
    state.eventos = [...eventosBase, ...manuais].map((e) => ({
      ...e,
      status: statusOverlay[e.id] || e.status || "novo",
    }));

    const now = new Date();
    state.calendar.year = now.getFullYear();
    state.calendar.month = now.getMonth();

    setupFiltros();
    setupViewTabs();
    setupForm();
    render();
  } catch (err) {
    document.getElementById("conteudo").innerHTML =
      `<p class="empty-state">Não foi possível carregar a Agenda: ${escapeHtml(err.message)}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", init);
