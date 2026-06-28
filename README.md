# RiftStats

A small, personal **League of Legends match-stats viewer** built on the official
Riot Games API. Enter a Riot ID and RiftStats shows that player's rank, recent
win rate, KDA and per-champion performance, with a per-queue breakdown
(Ranked Solo/Duo, Flex, Arena, Normal, …).

It is a lightweight local web app (Node + Express backend, vanilla-JS frontend).
There is no client automation of any kind — RiftStats only reads public stats
through the Riot Games API.

## Features

- Resolve a Riot ID (`Name#TAG`) to a summoner and show level + ranked tier/LP.
- Aggregate the last N matches into **win rate, W/L, KDA** and a **recent-form** strip.
- **Per-champion** table (games, win rate, KDA), sorted by games played.
- **Per-queue filter** — Ranked Solo/Duo, Flex, Arena and normals shown separately.
- Arena win rate counts only **1st place** as a win (not Riot's top-4 flag).
- Champion names/icons via Data Dragon.

## Riot APIs used

- **Account-V1** — resolve Riot ID → PUUID
- **Summoner-V4** — summoner level
- **League-V4** — ranked tier / LP / wins / losses
- **Match-V5** — match IDs and per-match participant stats

## Setup

```bash
npm install
cp .env.example .env      # then put your Riot API key into .env
npm run dev               # or: npm start
```

Open http://127.0.0.1:3010 and search a Riot ID.

### Configuration (`.env`)

| Variable         | Example   | Meaning                                   |
| ---------------- | --------- | ----------------------------------------- |
| `RIOT_API_KEY`   | `RGAPI-…` | Your Riot API key (never commit this)     |
| `PORT`           | `3010`    | Local server port                         |
| `RIOT_PLATFORM`  | `euw1`    | Platform host (`euw1`, `na1`, `kr`, …)    |
| `RIOT_REGION`    | `europe`  | Regional routing (`europe`/`americas`/`asia`/`sea`) |

## Rate limits

RiftStats fetches each match individually, so a single lookup uses about
`1 + N` requests. With a personal key (100 requests / 2 minutes) keep the
sample size modest (20–30 games). Match data is immutable, so a production
deployment would cache it.

## Disclaimer

RiftStats isn't endorsed by or affiliated with Riot Games. League of Legends
and Riot Games are trademarks or registered trademarks of Riot Games, Inc.

## License

MIT — see [LICENSE](LICENSE).
