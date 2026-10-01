const { fetchText, extractAnchors, stripHtml, makeOpportunity, jsonResponse, errorResponse, dedupe, extractDate, inferTopics } = require('./_shared');

const SOURCE_URL = 'https://tdr.who.int/grants';
const BASE_URL = 'https://tdr.who.int';

function findPortalUrl(html) {
  const a = extractAnchors(html, BASE_URL).find(x => /etdr portal/i.test(x.text) || /Open_Call|etdr/i.test(x.url));
  return a ? a.url : 'https://who.my.site.com/etdr/s/';
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
    if (!deadline) continue;
    const deadlineDate = new Date(deadline);
    if (Number.isNaN(deadlineDate.getTime()) || deadlineDate < now) continue;
    items.push(makeOpportunity({
      source: 'tdr', sourceName: 'WHO/TDR', title: a.text, url: a.url,
      summary: snippet.slice(0, 800), deadline, deadlineType: 'fixed', status: 'open',
      recordType: 'open-call', opportunityType: ['research-grant'], topics: inferTopics(snippet),
      geography: ['LMIC'], lmicsRelevant: true, lmicsCanApply: true, lmicsCanLead: null,
      eligibilityVerified: false,
      eligibilityNotes: 'Current TDR calls are commonly distributed through eTDR; exact applicant and lead eligibility must be checked in the specific call.',
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
      parser: 'open-calls-only-v3',
      note: items.length ? 'Only direct, future-dated call links were emitted.' : 'No directly exposed future-dated open calls were found on the public grants landing page. Evergreen programme/navigation links are intentionally not emitted as opportunities.'
    });
  } catch (err) { return errorResponse('tdr', err); }
};
exports._parse = parseDirectCalls;
exports._findPortalUrl = findPortalUrl;
