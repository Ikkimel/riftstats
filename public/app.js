const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const resultEl = $('result');

let data = null;
let activeQueue = 'All';

const rankLabel = (queueType) =>
  ({ RANKED_SOLO_5x5: 'Solo/Duo', RANKED_FLEX_SR: 'Flex' })[queueType] || queueType;

async function lookup() {
  const riotId = $('riotId').value.trim();
  if (!riotId) return;
  const count = $('count').value;
  $('go').disabled = true;
  statusEl.className = 'status';
  statusEl.textContent = 'Loading match history...';
  resultEl.innerHTML = '';
  try {
    const res = await fetch(`/api/stats?riotId=${encodeURIComponent(riotId)}&count=${count}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    data = json;
    activeQueue = 'All';
    statusEl.textContent = `Loaded ${json.sample} games.`;
    render();
  } catch (err) {
    statusEl.className = 'status error';
    statusEl.textContent = err.message;
  } finally {
    $('go').disabled = false;
  }
}

function view() {
  if (activeQueue === 'All') return data.overall;
  return data.byQueue.find((q) => q.queue === activeQueue) || data.overall;
}

function render() {
  if (!data) return;
  const v = view();
  const wrClass = v.winrate >= 50 ? 'pos' : 'neg';

  const ranks = (data.ranked || [])
    .map(
      (r) => `<div class="rank-card">
        <strong>${rankLabel(r.queueType)}</strong>
        <span>${r.tier} ${r.rank} · ${r.lp} LP</span>
        <small>${r.wins + r.losses} games · ${r.wins}W / ${r.losses}L</small>
      </div>`,
    )
    .join('');

  const tabs = ['All', ...data.byQueue.map((q) => q.queue)]
    .map((name) => {
      const total = name === 'All' ? data.overall.total : data.byQueue.find((q) => q.queue === name).total;
      return `<button data-q="${name}" class="${name === activeQueue ? 'active' : ''}">${name} (${total})</button>`;
    })
    .join('');

  const recent = v.recent
    .map((g) => `<span class="rg ${g.win ? 'win' : 'loss'}" title="${g.name} · ${g.kills}/${g.deaths}/${g.assists}">${g.win ? 'W' : 'L'}</span>`)
    .join('');

  const champs = v.champions
    .slice(0, 8)
    .map(
      (c) => `<div class="champ-row">
        <strong>${c.name}</strong>
        <span class="muted">${c.games} ${c.games === 1 ? 'game' : 'games'}</span>
        <span class="${c.winrate >= 50 ? 'pos' : 'neg'}">${c.winrate}%</span>
        <span>KDA ${c.kda}</span>
      </div>`,
    )
    .join('');

  resultEl.innerHTML = `
    <div class="profile"><h2>${data.account.gameName}</h2><span>#${data.account.tagLine}${data.summoner ? ` · Level ${data.summoner.level}` : ''}</span></div>
    ${ranks ? `<div class="ranks">${ranks}</div>` : ''}
    <div class="queue-tabs">${tabs}</div>
    <div class="overview">
      <div class="card"><span>Games</span><strong>${v.total}</strong></div>
      <div class="card"><span>Win rate</span><strong class="${wrClass}">${v.winrate}%</strong></div>
      <div class="card"><span>Win / Loss</span><strong>${v.wins} / ${v.losses}</strong></div>
      <div class="card"><span>KDA</span><strong>${v.kda}</strong></div>
    </div>
    <div class="recent"><span class="muted">Recent:</span>${recent}</div>
    <div class="champs">${champs}</div>
  `;

  resultEl.querySelectorAll('.queue-tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      activeQueue = b.dataset.q;
      render();
    }),
  );
}

$('go').addEventListener('click', lookup);
$('riotId').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') lookup();
});
