const {
  fetchText, stripHtml, extractNextData, walkObjects, absoluteUrl, makeOpportunity,
  jsonResponse, errorResponse, dedupe, extractDate, extractDeadlineLabel, inferTopics
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

function normalizeCandidate(c) {
  const combined = `${c.title} ${c.initiative || ''} ${c.description || ''}`;
  const status = /open/i.test(c.statusText || '') ? 'open' : (/opening soon/i.test(c.statusText || '') ? 'upcoming' : (/closed/i.test(c.statusText || '') ? 'closed' : 'unknown'));
  if (status === 'closed') return null;
  const lmic = /low- and middle-income|low- or middle-income|\bLMIC|global south|sub[- ]saharan africa|developing countr/i.test(combined);
  return makeOpportunity({
    source: 'grandchallenges', sourceName: 'Grand Challenges',
    title: c.title, url: c.url || SOURCE_URL, summary: c.description,
    deadline: extractDate(c.description), deadlineLabel: extractDeadlineLabel(c.description),
    status, recordType: status === 'upcoming' ? 'upcoming-call' : 'open-call',
    opportunityType: /travel award|travel support/i.test(combined) ? ['travel-award', 'training'] : ['challenge', 'research-grant'],
    topics: inferTopics(combined), geography: lmic ? ['LMIC'] : [],
    lmicsRelevant: lmic, lmicsCanApply: lmic ? true : null, lmicsCanLead: null,
    eligibilityVerified: false,
    eligibilityNotes: lmic ? 'The opportunity explicitly references LMIC participation; detailed applicant and lead eligibility should be verified on the linked opportunity page.' : null,
    raw: { listing: SOURCE_URL, initiative: c.initiative || null }
  });
}

function parseGrandChallenges(html) {
  const structured = fromNextData(html);
  const visible = fromVisibleText(html);
  const source = structured.length ? structured : visible;
  return dedupe(source.map(normalizeCandidate).filter(Boolean));
}

exports.handler = async () => {
  try {
    const html = await fetchText(SOURCE_URL);
    const items = parseGrandChallenges(html);
    return jsonResponse(items, { source: 'grandchallenges', sourceUrl: SOURCE_URL, parser: 'next-data-or-visible-text-v2', note: 'Utility/footer links are excluded; structured page data is preferred when available.' });
  } catch (err) { return errorResponse('grandchallenges', err); }
};
exports._parse = parseGrandChallenges;
exports._fromNextData = fromNextData;
exports._fromVisibleText = fromVisibleText;
