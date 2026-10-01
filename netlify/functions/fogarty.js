const { fetchText, stripHtml, absoluteUrl, makeOpportunity, jsonResponse, errorResponse, dedupe } = require('./_shared');

const SOURCE_URL = 'https://www.fic.nih.gov/Funding/Pages/Fogarty-Funding-Opps.aspx';
const BASE_URL = 'https://www.fic.nih.gov';

function parseFogarty(html) {
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
    const type = cellTexts[cells.length - 1] || '';
    const deadline = new Date(dateText);

    items.push(makeOpportunity({
      source: 'fogarty',
      sourceName: 'NIH Fogarty International Center',
      title,
      url,
      summary: type ? `${type}. Fogarty global health research funding opportunity.` : 'Fogarty global health research funding opportunity.',
      deadline: Number.isNaN(deadline.getTime()) ? null : deadline.toISOString(),
      status: Number.isNaN(deadline.getTime()) ? 'unknown' : (deadline >= new Date() ? 'open' : 'closed'),
      lmicsRelevant: true,
      raw: { dueDate: dateText, fundingType: type }
    }));
  }
  return dedupe(items);
}

exports.handler = async () => {
  try {
    const html = await fetchText(SOURCE_URL);
    const items = parseFogarty(html);
    return jsonResponse(items, { source: 'fogarty', sourceUrl: SOURCE_URL, parser: 'html-table' });
  } catch (err) { return errorResponse('fogarty', err); }
};

exports._parse = parseFogarty;
