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
    if (/resources-idrc-grantees|applying-funding|managing-funds|^https?:\/\/idrc-crdi\.ca\/en\/funding\/?$/i.test(a.url)) return false;
    const t = a.text.trim();
    return t.length > 18 && !/^(funding|open calls|closed calls|learn more)$/i.test(t);
  });
  return anchors.map(a => ({ title: a.text.trim(), url: a.url }));
}

function parseDetail(html, seed) {
  const text = stripHtml(html);
  const description = extractMeta(html, 'description') || extractMeta(html, 'og:description') || text.slice(0, 900);
  const combined = `${seed.title} ${description} ${text.slice(0, 8000)}`;
  const healthRelevant = isHealthRelevant(combined);
  const lmic = /developing regions|global south|sub[- ]saharan africa|africa|low[- ]and middle[- ]income|low- or middle-income/i.test(combined);
  const deadline = extractDate(text);
  const callType = /expressions? of interest/i.test(combined) ? 'Expression of interest'
    : (/concept notes?/i.test(combined) ? 'Concept note' : 'Call for proposals');
  const explicitHealthStream = /health|sexual and reproductive|maternal|child|infectious|climate.*health|health systems?/i.test(combined);
  const canLead = lmic && /principal applicant|lead applicant|applicant organisation|applicant institution/i.test(text) ? true : null;
  return { summary: description, topics: inferTopics(combined), healthRelevant: healthRelevant && explicitHealthStream, lmic, canLead, deadline, callType };
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
      if (!detail.deadline) continue;
      const deadlineDate = new Date(detail.deadline);
      if (Number.isNaN(deadlineDate.getTime()) || deadlineDate < new Date()) continue;
      items.push(makeOpportunity({
        source: 'idrc', sourceName: 'International Development Research Centre (IDRC)',
        title: seed.title, url: seed.url, summary: detail.summary,
        deadline: detail.deadline, deadlineType: 'fixed', status: 'open', recordType: 'open-call',
        callType: detail.callType,
        opportunityType: ['research-grant'], topics: detail.topics,
        geography: detail.lmic ? ['Global South'] : [],
        lmicsRelevant: detail.lmic,
        lmicsCanApply: detail.lmic ? true : null,
        lmicsCanLead: detail.canLead,
        eligibilityVerified: detail.canLead === true,
        eligibilityNotes: detail.lmic ? 'IDRC funds research within and alongside developing regions. Exact lead-applicant and country eligibility is call-specific.' : null,
        raw: { listing: SOURCE_URL }
      }));
    }
    return jsonResponse(dedupe(items), { source: 'idrc', sourceUrl: SOURCE_URL, parser: 'open-section-plus-detail-v3', discoveredOpenCalls: seeds.length, note: 'Only health-relevant calls listed in Open calls with a verified future deadline are emitted.' });
  } catch (err) { return errorResponse('idrc', err); }
};
exports._discover = discoverOpenCalls;
exports._parseDetail = parseDetail;
