/* Advanced client-only Tournament Formatter
   - CORS fallback via public proxy (failsafe)
   - Heuristic parser for Smogon OP
   - Generates BBCode for team/individual formats
   - Manual override map for replay URLs at top
*/

// ----------------------
// Manual replay overrides (format: "PlayerA vs PlayerB": ["url1","url2"] )
// Edit only here if you want to pre-insert real replay links.
const overrideReplayLinks = {
  // "cpt.kraken vs Fusien": ["https://replay.pokemonshowdown.com/smogtours-gen9monotype-890401"]
};

// ----------------------
// CORS proxy fallback (only used if direct fetch fails)
const CORS_PROXY = "https://corsproxy.io/?";

// ----------------------
// DOM refs
const $ = id => document.getElementById(id);
const threadInput = $('threadInput');
const btnParse = $('btnParse');
const btnGenerateReplays = $('btnGenerateReplays');
const btnGenerateKey = $('btnGenerateKey');
const parsedArea = $('parsedArea');
const parsedJson = $('parsedJson');
const outputArea = $('outputArea');
const bbOutput = $('bbOutput');
const keyArea = $('keyArea');
const keyOutput = $('keyOutput');
const copyReplays = $('copyReplays');
const copyKey = $('copyKey');

let parsedData = null;

// ----------------------
// Helper: fetch HTML with fallback to proxy
async function fetchHTML(url) {
  // Try direct first
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) return await res.text();
    // non-ok will fallthrough to proxy
  } catch (e) {
    // console.warn('Direct fetch failed:', e);
  }
  // Proxy fallback
  const proxied = CORS_PROXY + encodeURIComponent(url);
  const res2 = await fetch(proxied);
  if (!res2.ok) throw new Error('Both direct and proxy fetch failed');
  return await res2.text();
}

// ----------------------
// Utility: clean text, remove extra whitespace and BBCode artefacts
function cleanText(s) {
  return s.replace(/\[.*?\]/g, '').replace(/\r/g, '').split('\n').map(l=>l.trim()).filter(Boolean).join('\n');
}

// ----------------------
// Parse OP text/HTML into structured data
function parseOpFromHtml(htmlOrText) {
  // If we received full HTML, try to extract the first .message-body content (Smogon structure)
  let raw = htmlOrText;
  try {
    const doc = new DOMParser().parseFromString(htmlOrText, 'text/html');
    const op = doc.querySelector('.message-body') || doc.querySelector('.message-content') || doc.body;
    raw = op ? op.innerText : doc.body.innerText || htmlOrText;
  } catch (e) {
    raw = htmlOrText;
  }

  raw = cleanText(raw);

  const lines = raw.split('\n');
  const matches = [];
  const teamHeaders = new Set();
  let mode = 'individual';

  for (const line of lines) {
    // detect team headers e.g. ":tangela: Team A (4) vs (6) Team B :emote:"
    const teamHeaderMatch = line.match(/(.+?)\s+vs\s+(.+?)\s*$/i);
    if (teamHeaderMatch && /\(\d+\)/.test(line)) {
      const left = teamHeaderMatch[1].replace(/[:\[\]]/g,'').replace(/\(\d+\)/,'').trim();
      const right = teamHeaderMatch[2].replace(/[:\[\]]/g,'').replace(/\(\d+\)/,'').trim();
      teamHeaders.add(left); teamHeaders.add(right);
      mode = 'premier';
      continue;
    }

    // match lines like "RBY OU Bo5: PlayerA vs PlayerB"
    const matchLine = line.match(/^([A-Za-z0-9\-\s]+?):\s*(.+?)\s+vs\s+(.+)$/i);
    if (matchLine) {
      matches.push({ tier: matchLine[1].trim(), p1: matchLine[2].trim(), p2: matchLine[3].trim(), raw: line });
      mode = 'premier';
      continue;
    }

    // individuals: "PlayerA vs PlayerB" no tier (avoid false positives)
    const simpleMU = line.match(/^(.+?)\s+vs\s+(.+)$/i);
    if (simpleMU && !/bo\d|week|round|\(|\)/i.test(line)) {
      matches.push({ tier: null, p1: simpleMU[1].trim(), p2: simpleMU[2].trim(), raw: line });
      if (mode !== 'premier') mode = 'individual';
      continue;
    }
  }

  return { mode, teamHeaders: Array.from(teamHeaders), matches, raw };
}

// ----------------------
// Generate prefixes (simple initials with collision handling)
function initialsFromTeamName(teamName) {
  if (!teamName) return 'TM';
  const words = teamName.replace(/[^\w\s]/g,' ').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0,3).toUpperCase();
  const prefix = words.slice(0,3).map(w=>w[0]).join('').toUpperCase();
  return prefix.slice(0,4);
}
function buildPrefixMap(teamNames=[], overrides={}) {
  const map = {}, used = new Set(Object.values(overrides||{}).map(x=>x?.toUpperCase()));
  Object.assign(map, overrides||{});
  for (const t of teamNames) {
    if (map[t]) continue;
    let cand = initialsFromTeamName(t);
    let i=1;
    while (used.has(cand)) { cand = (cand.slice(0,3)+String(i)).toUpperCase(); i++; }
    map[t]=cand; used.add(cand);
  }
  return map;
}

// ----------------------
// Render preview to UI
function renderPreview(parsed) {
  parsedJson.textContent = JSON.stringify(parsed, null, 2);
  parsedArea.classList.remove('hidden');
}

// ----------------------
// Button: Parse
btnParse.addEventListener('click', async ()=>{
  const input = threadInput.value.trim();
  if (!input) return alert('Paste a Smogon URL or OP text.');

  try {
    let htmlOrText = input;
    if (/^https?:\/\//i.test(input)) {
      htmlOrText = await fetchHTML(input);
    }
    const parsed = parseOpFromHtml(htmlOrText);
    parsedData = parsed;
    renderPreview(parsed);
    btnGenerateReplays.disabled = false;
    btnGenerateKey.disabled = false;
  } catch (e) {
    alert('Parsing failed: ' + e.message);
  }
});

// ----------------------
// Button: Generate Replays (BBCode)
btnGenerateReplays.addEventListener('click', ()=>{
  if (!parsedData) return alert('Parse a thread first.');
  const opts = { useSprites: $('optSprites').checked, autoPrefixes: $('optAutoPrefixes').checked, generateKey: $('optKey').checked };
  const prefixes = buildPrefixMap(parsedData.teamHeaders || []);
  const sections = [];
  if (opts.generateKey && parsedData.teamHeaders.length) {
    sections.push('[B]Team Key[/B]');
    for (const t of parsedData.teamHeaders) {
      const pref = prefixes[t] || initialsFromTeamName(t);
      const sprite = opts.useSprites ? ':pokeball: ' : '';
      sections.push(`[B][${pref}][/B] ${sprite}[B]${t}[/B]`);
    }
    sections.push('\n');
  }

  // group by tier name
  const byTier = {};
  for (const m of parsedData.matches) {
    const tier = m.tier || 'Misc';
    if (!byTier[tier]) byTier[tier]=[];
    const key = `${m.p1} vs ${m.p2}`;
    const override = overrideReplayLinks[key] || overrideReplayLinks[encodeURIComponent(key)];
    const url = override ? override[0] : ('REPLAY_PLACEHOLDER:'+encodeURIComponent(key));
    const p1 = (opts.autoPrefixes && prefixes[m.p1]) ? `[${prefixes[m.p1]}] ${m.p1}` : m.p1;
    const p2 = (opts.autoPrefixes && prefixes[m.p2]) ? `${m.p2} [${prefixes[m.p2]}]` : m.p2;
    const line = `[URL='${url}']${opts.useSprites?':pokeball: ':''}${p1} vs ${p2}${opts.useSprites? ' :pokeball:':''}[/URL]`;
    byTier[tier].push(line);
  }

  for (const t of Object.keys(byTier)) {
    sections.push(`[B][SIZE=5]${t}[/SIZE][/B]`);
    for (const ln of byTier[t]) sections.push(ln);
    sections.push('\n');
  }

  const bb = sections.join('\n');
  bbOutput.value = bb;
  outputArea.classList.remove('hidden');
});

// ----------------------
// Button: Generate KEY only
btnGenerateKey.addEventListener('click', ()=>{
  if (!parsedData) return alert('Parse a thread first.');
  const prefixes = buildPrefixMap(parsedData.teamHeaders || []);
  const lines = [];
  for (const t of parsedData.teamHeaders) {
    const pref = prefixes[t] || initialsFromTeamName(t);
    lines.push(`[B][${pref}][/B] :pokeball: [B]${t}[/B]`);
  }
  keyOutput.value = lines.join('\n');
  keyArea.classList.remove('hidden');
});

// ----------------------
// Copy buttons
copyReplays?.addEventListener('click', async ()=>{
  await navigator.clipboard.writeText(bbOutput.value || '');
  copyReplays.textContent = 'Copied!'; setTimeout(()=>copyReplays.textContent='Copy Replays BBCode',1200);
});
copyKey?.addEventListener('click', async ()=>{
  await navigator.clipboard.writeText(keyOutput.value || '');
  copyKey.textContent = 'Copied!'; setTimeout(()=>copyKey.textContent='Copy KEY',1200);
});
