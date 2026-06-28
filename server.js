import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3010);
const API_KEY = process.env.RIOT_API_KEY;
const PLATFORM = process.env.RIOT_PLATFORM || 'euw1';
const REGION = process.env.RIOT_REGION || 'europe';

app.use(express.static(path.join(__dirname, 'public')));

// --- Riot API helper ---------------------------------------------------------
const riotFetch = async (url) => {
  if (!API_KEY) {
    const error = new Error('RIOT_API_KEY missing in .env');
    error.status = 500;
    throw error;
  }
  const response = await fetch(url, { headers: { 'X-Riot-Token': API_KEY } });
  if (!response.ok) {
    const body = await response.text();
    const error = new Error(body || response.statusText);
    error.status = response.status;
    throw error;
  }
  return response.json();
};

// --- Static data (Data Dragon) for champion id -> name -----------------------
let ddragon = { at: 0, version: null, championById: {} };
const getChampionMap = async () => {
  if (ddragon.version && Date.now() - ddragon.at < 6 * 60 * 60 * 1000) return ddragon.championById;
  const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
  const version = versions[0];
  const champs = await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`)).json();
  const championById = {};
  for (const c of Object.values(champs.data)) {
    championById[Number(c.key)] = {
      name: c.name,
      icon: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${c.image.full}`,
    };
  }
  ddragon = { at: Date.now(), version, championById };
  return championById;
};

// --- Match summarizing & aggregation ----------------------------------------
const QUEUE_NAMES = {
  420: 'Ranked Solo/Duo', 440: 'Ranked Flex', 400: 'Normal Draft', 430: 'Normal Blind',
  450: 'ARAM', 490: 'Quickplay', 700: 'Clash', 900: 'URF', 1900: 'URF',
  1700: 'Arena', 1710: 'Arena', 1720: 'Arena', 1750: 'Arena',
};
const queueName = (id) => QUEUE_NAMES[id] || (id ? `Queue ${id}` : 'Unknown');
const ARENA_QUEUES = new Set([1700, 1710, 1720, 1750]);

const summarizeMatch = (match, puuid) => {
  const info = match.info || {};
  const p = (info.participants || []).find((x) => x.puuid === puuid) || {};
  const isArena = ARENA_QUEUES.has(info.queueId) || (p.placement || 0) > 0;
  return {
    queueId: info.queueId,
    gameCreation: info.gameCreation,
    championId: p.championId,
    // Classic modes use win/loss. Arena: only 1st place counts as a real win.
    win: isArena ? p.placement === 1 : Boolean(p.win),
    placement: p.placement || null,
    kills: p.kills || 0,
    deaths: p.deaths || 0,
    assists: p.assists || 0,
  };
};

const aggregate = (matches, nameOf) => {
  const total = matches.length;
  const wins = matches.filter((m) => m.win).length;
  const k = matches.reduce((s, m) => s + m.kills, 0);
  const d = matches.reduce((s, m) => s + m.deaths, 0);
  const a = matches.reduce((s, m) => s + m.assists, 0);
  const byChamp = {};
  for (const m of matches) {
    if (!byChamp[m.championId]) byChamp[m.championId] = { championId: m.championId, games: 0, wins: 0, k: 0, d: 0, a: 0 };
    const c = byChamp[m.championId];
    c.games += 1; c.wins += m.win ? 1 : 0; c.k += m.kills; c.d += m.deaths; c.a += m.assists;
  }
  const champions = Object.values(byChamp)
    .map((c) => ({
      championId: c.championId, name: nameOf(c.championId), games: c.games, wins: c.wins,
      winrate: c.games ? Math.round((c.wins / c.games) * 100) : 0,
      kda: c.d ? Number(((c.k + c.a) / c.d).toFixed(2)) : c.k + c.a,
    }))
    .sort((x, y) => y.games - x.games || y.winrate - x.winrate);
  return {
    total, wins, losses: total - wins,
    winrate: total ? Math.round((wins / total) * 100) : 0,
    kda: d ? Number(((k + a) / d).toFixed(2)) : k + a,
    champions,
    recent: matches.slice(0, 15).map((m) => ({ win: m.win, name: nameOf(m.championId), kills: m.kills, deaths: m.deaths, assists: m.assists })),
  };
};

const parseRiotId = (raw) => {
  const value = String(raw || '').trim();
  const [gameName, tagLine] = value.split('#');
  if (!gameName || !tagLine) {
    const error = new Error('Use the Riot ID format Name#TAG');
    error.status = 400;
    throw error;
  }
  return { gameName: gameName.trim(), tagLine: tagLine.trim() };
};

// --- API endpoint ------------------------------------------------------------
app.get('/api/stats', async (req, res) => {
  try {
    const { gameName, tagLine } = parseRiotId(req.query.riotId);
    const count = Math.min(Number(req.query.count) || 20, 50);

    const account = await riotFetch(
      `https://${REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    );
    const puuid = account.puuid;
    const [summoner, league] = await Promise.all([
      riotFetch(`https://${PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`).catch(() => null),
      riotFetch(`https://${PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`).catch(() => []),
    ]);

    const ids = await riotFetch(
      `https://${REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`,
    );
    const matches = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      try {
        const match = await riotFetch(`https://${REGION}.api.riotgames.com/lol/match/v5/matches/${id}`);
        matches.push(summarizeMatch(match, puuid));
      } catch { /* skip a single match on error */ }
    }

    const championById = await getChampionMap();
    const nameOf = (id) => championById[id]?.name || (id > 0 ? `#${id}` : 'Unknown');

    const byNameGroups = {};
    for (const m of matches) {
      const name = queueName(m.queueId);
      (byNameGroups[name] = byNameGroups[name] || []).push(m);
    }
    const byQueue = Object.entries(byNameGroups)
      .map(([name, list]) => ({ queue: name, ...aggregate(list, nameOf) }))
      .sort((x, y) => y.total - x.total);

    res.json({
      account: { gameName: account.gameName, tagLine: account.tagLine },
      summoner: summoner ? { level: summoner.summonerLevel } : null,
      ranked: (league || []).map((e) => ({
        queueType: e.queueType, tier: e.tier, rank: e.rank, lp: e.leaguePoints, wins: e.wins, losses: e.losses,
      })),
      overall: aggregate(matches, nameOf),
      byQueue,
      sample: matches.length,
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'RiftStats', keyConfigured: Boolean(API_KEY) }));

app.listen(PORT, () => console.log(`RiftStats running on http://127.0.0.1:${PORT}`));
