// Marco 1: leitura local dos JSONs versionados. A gravação via GitHub
// Contents API (status de triagem, novos eventos) fica para um marco seguinte.

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

  return { loadFontes, loadEventos };
})();
