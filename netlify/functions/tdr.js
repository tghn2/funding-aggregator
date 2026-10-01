const { fetchText, stripHtml, extractAnchors, windowAround, makeOpportunity, jsonResponse, errorResponse, dedupe, extractDate } = require('./_shared');

// TDR's grants landing page points users to the eTDR portal for open calls, but individual
// calls are also published on WHO/TDR and WHO regional-office pages. This adapter extracts
// call-like links from the authoritative TDR grants page and deliberately avoids guessing
// hidden eTDR endpoints. Add regional WHO feeds in a second adapter when required.
const SOURCE_URL = 'https://tdr.who.int/grants';
const BASE_URL = 'https://tdr.who.int';

function parseTdr(html) {
  const anchors = extractAnchors(html, BASE_URL).filter(a => {
    const t = a.text.toLowerCase();
    return /call for|grant|scholarship|postgraduate|impact grants|clinical research leadership|funding/.test(t) && a.text.length > 12;
  });

  const items = anchors.map(a => {
    const context = windowAround(html, a.index, 1800);
    const text = stripHtml(context);
    const isPortal = /etdr/i.test(a.text) || /etdr/i.test(a.url);
    const title = isPortal ? 'TDR open calls for applications (eTDR portal)' : a.text;
    return makeOpportunity({
      source: 'tdr',
      sourceName: 'WHO/TDR',
      title,
      url: a.url,
      summary: isPortal
        ? 'TDR publishes current competitive research grant calls through the eTDR portal. Check the portal for the latest open calls and application requirements.'
        : text.slice(0, 650),
      deadline: extractDate(text),
      status: isPortal ? 'open' : 'unknown',
      geography: ['LMIC'],
      lmicsRelevant: true,
      lmicsCanApply: true,
      raw: { listing: SOURCE_URL, portalLink: isPortal }
    });
  });

  // Always include the authoritative grants landing page as a resilient fallback.
  items.push(makeOpportunity({
    source: 'tdr',
    sourceName: 'WHO/TDR',
    title: 'TDR grants and open calls for applications',
    url: SOURCE_URL,
    summary: 'TDR funds research projects in diseases of poverty and research-capacity development in countries where these diseases are prevalent. The grants page links to current open calls in the eTDR portal.',
    status: 'open',
    geography: ['LMIC'],
    lmicsRelevant: true,
    lmicsCanApply: true,
    opportunityType: ['research-grant', 'training']
  }));

  return dedupe(items);
}

exports.handler = async () => {
  try {
    const html = await fetchText(SOURCE_URL);
    const items = parseTdr(html);
    return jsonResponse(items, { source: 'tdr', sourceUrl: SOURCE_URL, parser: 'html-links', note: 'TDR open calls are principally published through the eTDR portal.' });
  } catch (err) { return errorResponse('tdr', err); }
};

exports._parse = parseTdr;
