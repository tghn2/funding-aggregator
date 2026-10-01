const { fetchText, extractAnchors, stripHtml, makeOpportunity, jsonResponse, errorResponse, dedupe, extractDate, inferTopics } = require('./_shared');

const SOURCE_URL = 'https://tdr.who.int/grants';
const BASE_URL = 'https://tdr.who.int';

function findPortalUrl(html) {
  const a = extractAnchors(html, BASE_URL).find(x => /etdr portal/i.test(x.text) || /Open_Call|etdr/i.test(x.url));
  return a ? a.url : null;
}

function parseDirectCalls(html, now = new Date()) {
  const anchors = extractAnchors(html, BASE_URL).filter(a => {
    const t = a.text.trim();
    return /^(?:open )?call for|^call for applications|^invitation for applications|^request for proposals/i.test(t)
      && !/grants and other funding opportunities/i.test(t);
  });
  const items = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const next = anchors[i + 1] ? anchors[i + 1].index : Math.min(html.length, a.index + 4500);
    const snippet = stripHtml(html.slice(a.index, next));
    const deadline = extractDate(snippet);
    const status = deadline ? (new Date(deadline) >= now ? 'open' : 'closed') : (/open/i.test(snippet) ? 'open' : 'unknown');
    if (status === 'closed') continue;
    items.push(makeOpportunity({
      source: 'tdr', sourceName: 'WHO/TDR', title: a.text, url: a.url,
      summary: snippet.slice(0, 800), deadline, status,
      recordType: 'open-call',
      opportunityType: ['research-grant'], topics: inferTopics(snippet),
      geography: ['LMIC'], lmicsRelevant: true, lmicsCanApply: true, lmicsCanLead: null,
      eligibilityVerified: false,
      eligibilityNotes: 'TDR calls are competitive and commonly target countries affected by diseases of poverty; exact applicant and lead eligibility must be checked in the specific call.',
      raw: { listing: SOURCE_URL }
    }));
  }
  return dedupe(items);
}

exports.handler = async () => {
  try {
    const html = await fetchText(SOURCE_URL);
    const portalUrl = findPortalUrl(html);
    const items = parseDirectCalls(html);
    return jsonResponse(items, {
      source: 'tdr', sourceUrl: SOURCE_URL, portalUrl,
      parser: 'open-calls-only-v2',
      note: items.length ? 'Direct current call links were found on the TDR grants page.' : 'No direct open-call records were exposed on the public grants landing page. TDR directs users to the eTDR portal for current and past calls; evergreen programme/navigation links are intentionally not emitted as opportunities.'
    });
  } catch (err) { return errorResponse('tdr', err); }
};
exports._parse = parseDirectCalls;
exports._findPortalUrl = findPortalUrl;
