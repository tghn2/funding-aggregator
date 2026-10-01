const { fetchText, parseRss, makeOpportunity, jsonResponse, errorResponse, absoluteUrl, dedupe, inferTopics, extractDate, extractDeadlineLabel } = require('./_shared');

const RSS_URL = 'https://www.global-health-edctp3.europa.eu/node/93/rss_en';
const BASE_URL = 'https://www.global-health-edctp3.europa.eu';

function isCompetitiveCall(entry) {
  const u = entry.link || '';
  const t = entry.title || '';
  if (/mobilisation of research funds|support for an africa office|funded strategic|award(?:ed)?\b|results? of|grant agreement|applications? received/i.test(t)) return false;
  return /funding-tenders\/opportunities\/portal\/screen\/opportunities\/topic-details/i.test(u)
    || /\/funding\/calls-proposals\//i.test(u);
}

function parseEdctp(xml, now = new Date()) {
  const items = [];
  for (const entry of parseRss(xml)) {
    if (!entry.title || !entry.link || !isCompetitiveCall(entry)) continue;
    const url = absoluteUrl(entry.link, BASE_URL);
    const combined = `${entry.title} ${entry.description}`;
    const published = entry.pubDate ? new Date(entry.pubDate) : null;
    const publishedAt = published && !Number.isNaN(published.getTime()) ? published.toISOString() : null;
    const deadline = extractDate(combined);
    const deadlineLabel = extractDeadlineLabel(combined);

    // Never infer "open" from the programme year or publication recency.
    // If no current/future deadline is exposed in the RSS item, keep the item out of the live feed.
    if (!deadline) continue;
    const deadlineDate = new Date(deadline);
    if (Number.isNaN(deadlineDate.getTime()) || deadlineDate < now) continue;

    const training = /fellow|training|capacity development/i.test(combined);
    items.push(makeOpportunity({
      source: 'edctp3', sourceName: 'Global Health EDCTP3',
      title: entry.title, url, summary: entry.description || entry.title,
      publishedAt, deadline, deadlineLabel, deadlineType: 'fixed', status: 'open', recordType: 'open-call',
      opportunityType: training ? ['fellowship', 'training'] : ['research-grant'],
      topics: inferTopics(combined), geography: ['Sub-Saharan Africa', 'Europe'],
      lmicsRelevant: true, lmicsCanApply: true, lmicsCanLead: null,
      eligibilityVerified: false,
      eligibilityNotes: 'Sub-Saharan African participation is central to Global Health EDCTP3; coordinator and lead eligibility varies by topic and must be checked in the EU Funding & Tenders call conditions.',
      raw: { feed: RSS_URL, sourcePublishedAt: publishedAt }
    }));
  }
  return dedupe(items);
}

exports.handler = async () => {
  try {
    const xml = await fetchText(RSS_URL, { headers: { Accept: 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8' } });
    const items = parseEdctp(xml);
    return jsonResponse(items, { source: 'edctp3', sourceUrl: RSS_URL, parser: 'rss-future-deadline-only-v3', note: 'No EDCTP3 item is emitted unless its RSS content exposes a future application deadline. Programme year or publication date is never treated as evidence that a call is open.' });
  } catch (err) { return errorResponse('edctp3', err); }
};
exports._parse = parseEdctp;
