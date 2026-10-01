const { fetchText, parseRss, makeOpportunity, jsonResponse, errorResponse, absoluteUrl, dedupe, inferTopics } = require('./_shared');

const RSS_URL = 'https://www.global-health-edctp3.europa.eu/node/93/rss_en';
const BASE_URL = 'https://www.global-health-edctp3.europa.eu';

function topicYear(url = '', title = '') {
  const m = `${url} ${title}`.match(/EDCTP3-(20\d{2})/i) || `${url} ${title}`.match(/-(20\d{2})-/);
  return m ? Number(m[1]) : null;
}

function isCompetitiveCall(entry) {
  const u = entry.link || '';
  const t = entry.title || '';
  if (/mobilisation of research funds|support for an africa office|funded strategic|award(?:ed)?\b|results? of|grant agreement/i.test(t)) return false;
  return /funding-tenders\/opportunities\/portal\/screen\/opportunities\/topic-details/i.test(u)
    || /\/funding\/calls-proposals\//i.test(u);
}

function parseEdctp(xml, now = new Date()) {
  const currentYear = now.getUTCFullYear();
  const ageLimit = now.getTime() - (220 * 24 * 60 * 60 * 1000);
  const items = [];

  for (const entry of parseRss(xml)) {
    if (!entry.title || !entry.link || !isCompetitiveCall(entry)) continue;
    const url = absoluteUrl(entry.link, BASE_URL);
    const year = topicYear(url, entry.title);
    const published = entry.pubDate ? new Date(entry.pubDate) : null;
    const publishedAt = published && !Number.isNaN(published.getTime()) ? published.toISOString() : null;
    if (year && year < currentYear) continue;
    if (!year && published && published.getTime() < ageLimit) continue;

    const combined = `${entry.title} ${entry.description}`;
    const recent = published && published.getTime() >= now.getTime() - (75 * 24 * 60 * 60 * 1000);
    const status = year > currentYear ? 'upcoming' : (recent ? 'open' : 'unknown');

    items.push(makeOpportunity({
      source: 'edctp3', sourceName: 'Global Health EDCTP3',
      title: entry.title, url, summary: entry.description || entry.title,
      publishedAt, status,
      recordType: status === 'upcoming' ? 'upcoming-call' : 'open-call',
      opportunityType: /fellow|training|network/i.test(combined) ? ['fellowship', 'training'] : ['research-grant'],
      topics: inferTopics(combined),
      geography: ['Sub-Saharan Africa', 'Europe'],
      lmicsRelevant: true,
      lmicsCanApply: true,
      lmicsCanLead: null,
      eligibilityVerified: false,
      eligibilityNotes: 'Sub-Saharan African participation is central to Global Health EDCTP3, but coordinator/lead eligibility varies by topic and must be checked in the EU Funding & Tenders call conditions.',
      raw: { feed: RSS_URL, topicYear: year }
    }));
  }
  return dedupe(items);
}

exports.handler = async () => {
  try {
    const xml = await fetchText(RSS_URL, { headers: { Accept: 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8' } });
    const items = parseEdctp(xml);
    return jsonResponse(items, { source: 'edctp3', sourceUrl: RSS_URL, parser: 'rss-filtered-v2', note: 'Only competitive call-like records from the current/future programme year are returned; old calls and project-mobilisation notices are excluded.' });
  } catch (err) { return errorResponse('edctp3', err); }
};
exports._parse = parseEdctp;
