import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Parser from 'rss-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const VEICULOS_PATH = path.join(ROOT, 'veiculos.json');
const OUTPUT_PATH = path.join(ROOT, 'feed.json');
const WINDOW_DAYS = 14;
const FETCH_TIMEOUT_MS = 10000;
const SUMMARY_MAX_LENGTH = 400;
const FETCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const parser = new Parser();

function decodeXml(buffer) {
  const preview = Buffer.from(buffer.slice(0, 200)).toString('latin1');
  const match = preview.match(/encoding=["']([^"']+)["']/i);
  const label = match ? match[1].toLowerCase() : 'utf-8';

  try {
    return new TextDecoder(label).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

async function fetchVeiculoItems(veiculo) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(veiculo.feed_url, {
      signal: controller.signal,
      headers: { 'User-Agent': FETCH_USER_AGENT },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const xml = decodeXml(await response.arrayBuffer());

    if (veiculo.formato === 'farolsign') {
      return parseFarolsignItems(xml, veiculo);
    }

    const parsed = await parser.parseString(xml);
    return parsed.items
      .map((item) => normalizeItem(item, veiculo))
      .filter((item) => item !== null);
  } catch (err) {
    console.error(`[build-feed] falha ao buscar "${veiculo.nome}" (${veiculo.feed_url}): ${err.message}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Formato proprietário (não é RSS/Atom): <data><item><pubDate>YYYY-MM-DD
// HH:MM:SS</pubDate><title>...</title><description><truncate>...</truncate>
// ...</description></item></data>, sem <link> por item. Como não há URL do
// artigo original, cada item aponta pra veiculo.url (a seção, não a matéria
// específica) — é o melhor link disponível nesse formato.
function parseFarolsignItems(xml, veiculo) {
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  return itemBlocks
    .map((raw) => {
      const pubDateMatch = raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const titleMatch = raw.match(/<title>([\s\S]*?)<\/title>/);
      const truncateMatch = raw.match(/<truncate>([\s\S]*?)<\/truncate>/);

      const pubDateRaw = pubDateMatch ? pubDateMatch[1].trim() : null;
      const title = titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : null;
      if (!pubDateRaw || !title) return null;

      const date = new Date(pubDateRaw.replace(' ', 'T') + '-03:00');
      if (Number.isNaN(date.getTime())) return null;

      const resumo = truncateMatch
        ? decodeXmlEntities(truncateMatch[1].trim()).slice(0, SUMMARY_MAX_LENGTH)
        : '';

      return {
        id: `${veiculo.id}|${pubDateRaw}|${title}`,
        titulo: title,
        link: veiculo.url,
        veiculo_id: veiculo.id,
        publicado_em: date.toISOString(),
        resumo,
      };
    })
    .filter((item) => item !== null);
}

function normalizeItem(item, veiculo) {
  const link = item.link;
  const rawDate = item.isoDate || item.pubDate;
  const date = rawDate ? new Date(rawDate) : null;

  if (!link || !date || Number.isNaN(date.getTime())) {
    return null;
  }

  const summaryRaw = item.contentSnippet || item.summary || item.content || '';
  const summary = summaryRaw.trim().slice(0, SUMMARY_MAX_LENGTH);

  return {
    id: link,
    titulo: (item.title || '(sem título)').trim(),
    link,
    veiculo_id: veiculo.id,
    publicado_em: date.toISOString(),
    resumo: summary,
  };
}

function dedupeById(items) {
  const byId = new Map();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

function withinWindow(items, windowDays) {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  return items.filter((item) => new Date(item.publicado_em).getTime() >= cutoff);
}

async function main() {
  const veiculosJson = JSON.parse(await readFile(VEICULOS_PATH, 'utf-8'));
  const feedVeiculos = veiculosJson.veiculos.filter((v) => v.tipo_coleta === 'feed' && v.feed_url);

  console.log(`[build-feed] buscando ${feedVeiculos.length} feed(s)...`);
  const results = await Promise.all(feedVeiculos.map(fetchVeiculoItems));
  const allItems = results.flat();

  const deduped = dedupeById(allItems);
  const recent = withinWindow(deduped, WINDOW_DAYS);
  recent.sort((a, b) => new Date(b.publicado_em) - new Date(a.publicado_em));

  const feed = {
    gerado_em: new Date().toISOString(),
    janela_dias: WINDOW_DAYS,
    itens: recent,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(feed, null, 2), 'utf-8');
  console.log(`[build-feed] feed.json gerado com ${recent.length} item(ns).`);
}

main().catch((err) => {
  console.error('[build-feed] erro fatal:', err);
  process.exit(1);
});
