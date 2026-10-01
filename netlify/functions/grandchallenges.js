const {
  fetchText, stripHtml, extractNextData, walkObjects, absoluteUrl, makeOpportunity,
  jsonResponse, errorResponse, dedupe, extractDeadlineLabel, inferTopics
} = require('./_shared');

const SOURCE_URL = 'https://www.grandchallenges.org/grant-opportunities';
const BASE_URL = 'https://www.grandchallenges.org';

function firstString(obj, keys) {
  for (const k of keys) if (typeof obj[k] === 'string' && obj[k].trim()) return obj[k].trim();
  return '';
}

function fromNextData(html) {
  const data = extractNextData(html);
  if (!data) return [];
  const candidates = [];
  walkObjects(data, obj => {
    if (Array.isArray(obj)) return;
    const title = firstString(obj, ['title', 'headline', 'name']);
    const description = firstString(obj, ['description', 'summary', 'body', 'copy']);
    const statusText = firstString(obj, ['status', 'applicationStatus', 'applicationsStatus']);
    const initiative = firstString(obj, ['initiative', 'initiativeName', 'program', 'programme']);
    let url = firstString(obj, ['url', 'href', 'link', 'learnMoreUrl', 'learnMoreLink']);
    const blob = stripHtml(`${title} ${description} ${statusText} ${initiative}`);
    if (!title || title.length < 15 || !description || description.length < 30) return;
    if (/privacy policy|terms of use|cookie|grant opportunities$/i.test(title)) return;
    if (!/grant|fund|award|challenge|applications?|scientist|research|health|development/i.test(blob)) return;
    if (url) url = absoluteUrl(url, BASE_URL);
    candidates.push({ title, description: stripHtml(description), statusText, initiative, url: url || SOURCE_URL });
  });
  return candidates;
}

function fromVisibleText(html) {
  const text = stripHtml(html);
  const items = [];
  const re = /(.{15,220}?)\s+Initiative\s+(.{3,180}?)\s+(Applications? Open|Applications? Closed|Opening Soon)\s+Description\s+([\s\S]{40,2600}?)(?=\s+Learn More\b|\s+Privacy Policy\b|$)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const title = m[1].replace(/^.*Grant Opportunities\s+/i, '').trim();
    if (/privacy policy|terms of use/i.test(title)) continue;
    items.push({ title, initiative: m[2].trim(), statusText: m[3].trim(), description: m[4].trim(), url: SOURCE_URL });
  }
  return items;
}

function parseDeadlineRange(text) {
  const clean = stripHtml(text);
  const m = clean.match(/deadlines? vary from\s+([A-Za-z]+\s+\d{1,2},?\s+20\d{2})\s+through\s+([A-Za-z]+\s+\d{1,2},?\s+20\d{2})/i);
  if (!m) return null;
  const earliest = new Date(m[1]);
  const latest = new Date(m[2]);
  if (Number.isNaN(earliest.getTime()) || Number.isNaN(latest.getTime())) return null;
  return { earliest: earliest.toISOString(), latest: latest.toISOString() };
}

function normalizeCandidate(c, now = new Date()) {
  const combined = `${c.title} ${c.initiative || ''} ${c.description || ''}`;
  const statusText = c.statusText || '';
  if (/closed/i.test(statusText)) return null;
  const lmic = /low- and middle-income|low- or middle-income|\bLMIC|global south|sub[- ]saharan africa|developing countr/i.test(combined);
  const range = parseDeadlineRange(c.description);
  const latest = range ? new Date(range.latest) : null;
  if (range && (!latest || Number.isNaN(latest.getTime()) || latest < now)) return null;
  if (!range && !/open|opening soon/i.test(statusText)) return null;

  const isTravel = /travel award|travel support/i.test(combined);
  const isVirtualAccess = /livestream|on.?demand|virtual viewing/i.test(combined);
  const opportunityType = isTravel ? ['travel-award'] : ['challenge', 'research-grant'];
  const relatedOpportunities = isTravel && isVirtualAccess ? ['Global Health Awards - virtual access'] : (isTravel ? ['Global Health Awards - virtual access'] : null);

  return makeOpportunity({
    source: 'grandchallenges', sourceName: 'Grand Challenges',
    title: isTravel ? 'Keystone Symposia: Global Health Travel Awards for 2027 Conferences' : c.title,
    url: c.url || SOURCE_URL,
    summary: c.description,
    deadline: null,
    deadlineLabel: range ? 'Deadlines vary by conference' : extractDeadlineLabel(c.description),
    deadlineType: range ? 'varies' : (/rolling|apply anytime/i.test(c.description) ? 'rolling' : 'unknown'),
    deadlineRange: range,
    status: /opening soon/i.test(statusText) ? 'upcoming' : 'open',
    recordType: /opening soon/i.test(statusText) ? 'upcoming-call' : 'open-call',
    opportunityType,
    topics: [...new Set([...inferTopics(combined), ...(isTravel ? ['global-health'] : [])])],
    geography: lmic ? ['LMIC'] : [],
    lmicsRelevant: lmic,
    lmicsCanApply: lmic ? true : null,
    lmicsCanLead: null,
    eligibilityVerified: false,
    eligibilityNotes: lmic ? 'The opportunity explicitly references LMIC participation; detailed applicant eligibility should be verified on the linked opportunity page.' : null,
    relatedOpportunities,
    raw: { listing: SOURCE_URL, initiative: c.initiative || null }
  });
}

function parseGrandChallenges(html, now = new Date()) {
  const structured = fromNextData(html);
  const visible = fromVisibleText(html);
  const source = structured.length ? structured : visible;
  return dedupe(source.map(c => normalizeCandidate(c, now)).filter(Boolean));
}

exports.handler = async () => {
  try {
    const html = await fetchText(SOURCE_URL);
    const items = parseGrandChallenges(html);
    return jsonResponse(items, { source: 'grandchallenges', sourceUrl: SOURCE_URL, parser: 'next-data-or-visible-text-v3', note: 'Only non-utility opportunity records are emitted. Variable deadlines are represented as a range rather than a single misleading deadline.' });
  } catch (err) { return errorResponse('grandchallenges', err); }
};
exports._parse = parseGrandChallenges;
exports._fromNextData = fromNextData;
exports._fromVisibleText = fromVisibleText;
