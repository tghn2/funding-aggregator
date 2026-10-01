const { fetchText, parseRss, makeOpportunity, jsonResponse, errorResponse, absoluteUrl } = require('./_shared');

const RSS_URL = 'https://www.global-health-edctp3.europa.eu/node/93/rss_en';
const BASE_URL = 'https://www.global-health-edctp3.europa.eu';

function parseEdctp(xml) {
  return parseRss(xml).map(entry => {
    const combined = `${entry.title} ${entry.description}`;
    const isClosed = /\bclosed\b/i.test(combined);
    const isOpen = /\bopen\b/i.test(combined);
    return makeOpportunity({
      source: 'edctp3',
      sourceName: 'Global Health EDCTP3',
      title: entry.title,
      url: absoluteUrl(entry.link, BASE_URL),
      summary: entry.description,
      publishedAt: entry.pubDate ? new Date(entry.pubDate).toISOString() : null,
      status: isClosed ? 'closed' : (isOpen ? 'open' : 'unknown'),
      geography: ['Sub-Saharan Africa', 'Europe'],
      lmicsRelevant: true,
      lmicsCanApply: true,
      raw: { feed: RSS_URL }
    });
  }).filter(x => x.title && x.url);
}

exports.handler = async () => {
  try {
    const xml = await fetchText(RSS_URL, { headers: { Accept: 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8' } });
    const items = parseEdctp(xml);
    return jsonResponse(items, { source: 'edctp3', sourceUrl: RSS_URL, parser: 'rss' });
  } catch (err) { return errorResponse('edctp3', err); }
};

exports._parse = parseEdctp;
