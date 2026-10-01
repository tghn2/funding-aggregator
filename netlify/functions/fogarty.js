const { fetchText, stripHtml, absoluteUrl, makeOpportunity, jsonResponse, errorResponse, dedupe } = require('./_shared');

const SOURCE_URL = 'https://www.fic.nih.gov/Funding/Pages/Fogarty-Funding-Opps.aspx';
const BASE_URL = 'https://www.fic.nih.gov';

function careerFor(title, fundingType) {
  const text = `${title} ${fundingType}`;
  if (/Emerging Global Leader|K43/i.test(text)) return ['early-career'];
  if (/career development/i.test(text)) return ['early-career', 'mid-career'];
  return [];
}

function parseFogarty(html, now = new Date()) {
  const items = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x => x[1]);
    if (cells.length < 2) continue;
    const cellTexts = cells.map(stripHtml);
    const dateText = cellTexts[0];
    if (!/20\d{2}/.test(dateText)) continue;

    const anchor = row.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const title = anchor ? stripHtml(anchor[2]) : cellTexts[1];
    if (!title || /due date|fogarty program/i.test(title)) continue;
    const url = anchor ? absoluteUrl(anchor[1], BASE_URL) : SOURCE_URL;
    const fundingType = cellTexts[cells.length - 1] || '';
    const deadlineDate = new Date(dateText);
    const deadline = Number.isNaN(deadlineDate.getTime()) ? null : deadlineDate.toISOString();
    if (!deadline || deadlineDate < now) continue;

    items.push(makeOpportunity({
      source: 'fogarty',
      sourceName: 'NIH Fogarty International Center',
      title,
      url,
      summary: /Emerging Global Leader|K43/i.test(title)
        ? 'Career development award for early-career research scientists at eligible LMIC institutions to develop an independent global health research programme.'
        : (fundingType ? `${fundingType}. Fogarty global health research funding opportunity.` : 'Fogarty global health research funding opportunity.'),
      deadline,
      deadlineType: 'fixed',
      status: 'open',
      recordType: 'open-call',
      callType: 'NIH funding opportunity announcement',
      opportunityType: /career development|K43/i.test(`${title} ${fundingType}`) ? ['career-development', 'research-grant'] : ['research-grant'],
      careerStage: careerFor(title, fundingType),
      topics: ['global-health'],
      geography: ['LMIC'],
      lmicsRelevant: true,
      lmicsCanApply: true,
      lmicsCanLead: true,
      eligibilityVerified: true,
      eligibilityNotes: 'Fogarty LMIC-focused career-development programmes require applicants to follow the specific NOFO and Fogarty country-eligibility rules.',
      raw: { dueDate: dateText, fundingType }
    }));
  }
  return dedupe(items);
}

exports.handler = async () => {
  try {
    const html = await fetchText(SOURCE_URL);
    const items = parseFogarty(html);
    return jsonResponse(items, { source: 'fogarty', sourceUrl: SOURCE_URL, parser: 'html-table-v3', filtering: 'future deadlines only' });
  } catch (err) { return errorResponse('fogarty', err); }
};
exports._parse = parseFogarty;
