const { fetchText, stripHtml, extractAnchors, windowAround, makeOpportunity, jsonResponse, errorResponse, dedupe, extractDate } = require('./_shared');

const SOURCE_URL = 'https://idrc-crdi.ca/en/funding';
const BASE_URL = 'https://idrc-crdi.ca';

function parseIdrc(html) {
  const anchors = extractAnchors(html, BASE_URL).filter(a => {
    if (!a.url.startsWith(BASE_URL)) return false;
    const t = a.text.toLowerCase();
    return /call for|research award|funding|grant|initiative|supporting|fellowship/.test(t) && a.text.length > 18;
  });

  const items = anchors.map(a => {
    const context = windowAround(html, a.index, 1800);
    const text = stripHtml(context);
    const deadline = extractDate(text);
    const isOpenSection = /open calls/i.test(text) && !/closed calls/i.test(text.slice(0, Math.max(0, text.indexOf(a.text))));
    const status = deadline ? (new Date(deadline) >= new Date() ? 'open' : 'closed') : (isOpenSection ? 'open' : 'unknown');
    const summary = text.replace(a.text, '').slice(0, 650);
    return makeOpportunity({
      source: 'idrc',
      sourceName: 'International Development Research Centre (IDRC)',
      title: a.text,
      url: a.url,
      summary,
      deadline,
      status,
      geography: ['Global South'],
      lmicsRelevant: true,
      lmicsCanApply: true,
      raw: { listing: SOURCE_URL }
    });
  });
  return dedupe(items).filter(x => !/applying for funding|how to apply|funding opportunities?$/i.test(x.title));
}

exports.handler = async () => {
  try {
    const html = await fetchText(SOURCE_URL);
    const items = parseIdrc(html);
    return jsonResponse(items, { source: 'idrc', sourceUrl: SOURCE_URL, parser: 'html-links' });
  } catch (err) { return errorResponse('idrc', err); }
};

exports._parse = parseIdrc;
