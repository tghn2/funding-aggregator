const {
  fetchText, stripHtml, extractAnchors, makeOpportunity, jsonResponse, errorResponse,
  dedupe, extractDate, extractMeta, inferTopics, isHealthRelevant
} = require('./_shared');

const SOURCE_URL = 'https://idrc-crdi.ca/en/funding';
const BASE_URL = 'https://idrc-crdi.ca';

function openSection(html) {
  const lower = html.toLowerCase();
  const start = lower.indexOf('open calls');
  if (start < 0) return '';
  const end = lower.indexOf('closed calls', start + 10);
  return html.slice(start, end > start ? end : Math.min(html.length, start + 50000));
}

function discoverOpenCalls(html) {
  const section = openSection(html);
  if (!section) return [];
  const anchors = extractAnchors(section, BASE_URL).filter(a => {
    if (!/\/en\/funding\//.test(a.url)) return false;
    if (/resources-idrc-grantees|applying-funding|managing-funds/i.test(a.url)) return false;
    const t = a.text.trim();
    return t.length > 18 && !/^(funding|open calls|closed calls|learn more)$/i.test(t);
  });
  return anchors.map((a, i) => {
    const next = anchors[i + 1] ? anchors[i + 1].index : Math.min(section.length, a.index + 5000);
    const snippet = stripHtml(section.slice(a.index, next));
    return { title: a.text, url: a.url, deadline: extractDate(snippet), snippet };
  });
}

function parseDetail(html, seed) {
  const text = stripHtml(html);
  const description = extractMeta(html, 'description') || extractMeta(html, 'og:description') || text.slice(0, 900);
  const combined = `${seed.title} ${description} ${text.slice(0, 5000)}`;
  const healthRelevant = isHealthRelevant(combined);
  const lmic = /developing regions|global south|sub[- ]saharan africa|africa|low[- ]and middle[- ]income|low- or middle-income/i.test(combined);
  const leadVerified = /principal applicant|lead applicant|applicant organisation|applicant institution/i.test(combined) && lmic;
  return {
    summary: description,
    topics: inferTopics(combined),
    healthRelevant,
    lmic,
    canLead: leadVerified ? true : null,
    eligibilityVerified: leadVerified
  };
}

exports.handler = async () => {
  try {
    const html = await fetchText(SOURCE_URL);
    const seeds = discoverOpenCalls(html).slice(0, 12);
    const results = await Promise.allSettled(seeds.map(async seed => ({ seed, detail: parseDetail(await fetchText(seed.url), seed) })));
    const items = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { seed, detail } = r.value;
      if (!detail.healthRelevant) continue;
      const deadline = seed.deadline;
      if (deadline && new Date(deadline).getTime() < Date.now()) continue;
      items.push(makeOpportunity({
        source: 'idrc', sourceName: 'International Development Research Centre (IDRC)',
        title: seed.title, url: seed.url, summary: detail.summary,
        deadline, status: 'open', recordType: 'open-call',
        callType: /expressions? of interest/i.test(seed.snippet) ? 'Expression of interest' : (/concept notes?/i.test(seed.snippet) ? 'Concept note' : 'Call for proposals'),
        opportunityType: ['research-grant'], topics: detail.topics,
        geography: detail.lmic ? ['Global South'] : [],
        lmicsRelevant: detail.lmic,
        lmicsCanApply: detail.lmic ? true : null,
        lmicsCanLead: detail.canLead,
        eligibilityVerified: detail.eligibilityVerified,
        eligibilityNotes: detail.lmic ? 'IDRC funds research within and alongside developing regions. Exact lead-applicant and country eligibility is call-specific.' : null,
        raw: { listing: SOURCE_URL, listingSnippet: seed.snippet.slice(0, 600) }
      }));
    }
    return jsonResponse(dedupe(items), { source: 'idrc', sourceUrl: SOURCE_URL, parser: 'open-section-plus-detail-v2', discoveredOpenCalls: seeds.length, note: 'Only calls listed in the Open calls section and assessed as health-relevant from the call detail page are emitted.' });
  } catch (err) { return errorResponse('idrc', err); }
};
exports._discover = discoverOpenCalls;
exports._parseDetail = parseDetail;
