// Leitura: sempre dos JSONs estáticos publicados (funciona sem token).
// Gravação (triagem, eventos manuais, salvos do feed): via GitHub Contents
// API, exige um Personal Access Token configurado neste navegador. Sem
// token, a gravação cai para o armazenamento local (ver app.js).

const GITHUB_OWNER = "denispacheco-prog";
const GITHUB_REPO = "agenda";
const GITHUB_BRANCH = "main";
const EVENTOS_PATH = "eventos.json";
const FEED_SALVOS_PATH = "feed-salvos.json";
const FONTES_PATH = "fontes.json";
const TOKEN_STORAGE_KEY = "agenda:githubToken";

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function ghGetFile(path) {
  const token = getToken();
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
  );
  if (res.status === 404) return { data: null, sha: null };
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Token do GitHub inválido ou sem permissão. Reconfigure em "🔑 GitHub".');
    }
    throw new Error(`Falha ao ler ${path} do GitHub (status ${res.status})`);
  }
  const json = await res.json();
  return { data: JSON.parse(base64ToUtf8(json.content)), sha: json.sha };
}

async function ghPutFile(path, data, sha, message) {
  const token = getToken();
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        content: utf8ToBase64(JSON.stringify(data, null, 2) + "\n"),
        sha: sha || undefined,
        branch: GITHUB_BRANCH,
      }),
    }
  );
  if (!res.ok) {
    if (res.status === 409) {
      throw new Error("Os dados mudaram enquanto você editava. Recarregue a página e tente de novo.");
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Falha ao gravar ${path} no GitHub (status ${res.status})`);
  }
}

const API = (() => {
  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Falha ao carregar ${path}: ${res.status}`);
    return res.json();
  }

  async function loadFontes() {
    const data = await fetchJson("fontes.json");
    return data.fontes;
  }

  async function loadEventos() {
    const data = await fetchJson("eventos.json");
    return data.eventos;
  }

  async function loadVeiculos() {
    const data = await fetchJson("veiculos.json");
    return data.veiculos;
  }

  async function loadFeed() {
    const data = await fetchJson("feed.json");
    return data.itens;
  }

  function isGithubConfigured() {
    return !!getToken();
  }

  function configureGithubToken(token) {
    setToken(token);
  }

  async function loadEventosGithub() {
    const { data } = await ghGetFile(EVENTOS_PATH);
    return (data && data.eventos) || [];
  }

  async function saveEventoStatus(eventId, status) {
    const { data, sha } = await ghGetFile(EVENTOS_PATH);
    const eventos = (data && data.eventos) || [];
    const target = eventos.find((e) => e.id === eventId);
    if (!target) throw new Error("evento não encontrado no GitHub");
    target.status = status;
    await ghPutFile(EVENTOS_PATH, { eventos }, sha, `Atualiza status de "${target.titulo}" para ${status}`);
    return eventos;
  }

  async function addManualEventoGithub(evento) {
    const { data, sha } = await ghGetFile(EVENTOS_PATH);
    const eventos = (data && data.eventos) || [];

    // O id chega calculado a partir do estado local, que pode estar
    // desatualizado em relação ao arquivo no GitHub (ex.: duas gravações
    // próximas antes do estado local refletir a primeira). Revalida contra
    // os dados recém-buscados pra nunca gravar um id duplicado.
    if (eventos.some((e) => e.id === evento.id)) {
      let n = 2;
      let novoId = `${evento.id}-${n}`;
      while (eventos.some((e) => e.id === novoId)) {
        n++;
        novoId = `${evento.id}-${n}`;
      }
      evento = { ...evento, id: novoId };
    }

    eventos.push(evento);
    await ghPutFile(EVENTOS_PATH, { eventos }, sha, `Adiciona evento: ${evento.titulo}`);
    return eventos;
  }

  async function removeEventoGithub(eventoId) {
    const { data, sha } = await ghGetFile(EVENTOS_PATH);
    const eventos = (data && data.eventos) || [];
    const filtered = eventos.filter((e) => e.id !== eventoId);
    await ghPutFile(EVENTOS_PATH, { eventos: filtered }, sha, `Remove evento ${eventoId}`);
    return filtered;
  }

  async function updateEventoGithub(evento) {
    const { data, sha } = await ghGetFile(EVENTOS_PATH);
    const eventos = (data && data.eventos) || [];
    const idx = eventos.findIndex((e) => e.id === evento.id);
    if (idx === -1) throw new Error("evento não encontrado no GitHub");
    eventos[idx] = { ...eventos[idx], ...evento };
    await ghPutFile(EVENTOS_PATH, { eventos }, sha, `Edita evento: "${evento.titulo}"`);
    return eventos;
  }

  async function addFonteGithub(fonte) {
    const { data, sha } = await ghGetFile(FONTES_PATH);
    const fontes = (data && data.fontes) || [];

    if (fontes.some((f) => f.id === fonte.id)) {
      let n = 2;
      let novoId = `${fonte.id}-${n}`;
      while (fontes.some((f) => f.id === novoId)) {
        n++;
        novoId = `${fonte.id}-${n}`;
      }
      fonte = { ...fonte, id: novoId };
    }

    fontes.push(fonte);
    await ghPutFile(FONTES_PATH, { fontes }, sha, `Adiciona lugar: ${fonte.nome}`);
    return fontes;
  }

  async function updateFonteGithub(fonte) {
    const { data, sha } = await ghGetFile(FONTES_PATH);
    const fontes = (data && data.fontes) || [];
    const idx = fontes.findIndex((f) => f.id === fonte.id);
    if (idx === -1) throw new Error("lugar não encontrado no GitHub");
    fontes[idx] = { ...fontes[idx], ...fonte };
    await ghPutFile(FONTES_PATH, { fontes }, sha, `Edita lugar: ${fonte.nome}`);
    return fontes;
  }

  async function removeFonteGithub(fonteId) {
    const { data, sha } = await ghGetFile(FONTES_PATH);
    const fontes = (data && data.fontes) || [];
    const target = fontes.find((f) => f.id === fonteId);
    const filtered = fontes.filter((f) => f.id !== fonteId);
    await ghPutFile(FONTES_PATH, { fontes: filtered }, sha, `Remove lugar${target ? ": " + target.nome : ""}`);
    return filtered;
  }

  async function loadFeedSalvosGithub() {
    const { data } = await ghGetFile(FEED_SALVOS_PATH);
    return (data && data.itens) || [];
  }

  async function saveFeedItemGithub(item) {
    const { data, sha } = await ghGetFile(FEED_SALVOS_PATH);
    const itens = (data && data.itens) || [];
    if (!itens.some((i) => i.id === item.id)) {
      itens.push({ ...item, salvo_em: new Date().toISOString() });
    }
    await ghPutFile(FEED_SALVOS_PATH, { itens }, sha, `Salva item do feed: ${item.titulo}`);
    return itens;
  }

  async function removeFeedItemGithub(itemId) {
    const { data, sha } = await ghGetFile(FEED_SALVOS_PATH);
    const itens = (data && data.itens) || [];
    const filtered = itens.filter((i) => i.id !== itemId);
    await ghPutFile(FEED_SALVOS_PATH, { itens: filtered }, sha, "Remove item salvo do feed");
    return filtered;
  }

  return {
    loadFontes,
    loadEventos,
    loadVeiculos,
    loadFeed,
    isGithubConfigured,
    configureGithubToken,
    loadEventosGithub,
    saveEventoStatus,
    addManualEventoGithub,
    removeEventoGithub,
    updateEventoGithub,
    addFonteGithub,
    updateFonteGithub,
    removeFonteGithub,
    loadFeedSalvosGithub,
    saveFeedItemGithub,
    removeFeedItemGithub,
  };
})();
