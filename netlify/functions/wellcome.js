const { fetchText, stripHtml, extractAnchors, windowAround, makeOpportunity, jsonResponse, errorResponse, dedupe, extractDate } = require('./_shared');

const SOURCE_URL = 'https://wellcome.org/research-funding/schemes?sort_by=scheme_accepting_applications';
const BASE_URL = 'https://wellcome.org';

function parseWellcome(html) {
  const anchors = extractAnchors(html, BASE_URL)
    .filter(a => /\/research-funding\/schemes\//.test(a.url) || /\/grant-funding\/schemes\//.test(a.url));

  const items = anchors.map(a => {
    const context = windowAround(html, a.index, 2600);
    const text = stripHtml(context);
    const status = /open to (?:new )?applications|apply anytime/i.test(text)
      ? 'open' : (/closed to applications/i.test(text) ? 'closed' : (/upcoming/i.test(text) ? 'upcoming' : 'unknown'));
    const summaryMatch = text.match(new RegExp(a.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(?:Apply anytime|Open to applications|Closed to applications|Upcoming)?\\s*([^]{30,500}?)(?=Lead applicant career stage:|Administering organisation location:|Funding duration:|Funding amount:|Strategic programme:|Frequency:|Coapplicants:|$)', 'i'));
    const summary = summaryMatch ? summaryMatch[1] : text.slice(0, 700);
    const lmicRelevant = /low- or middle-income|low- and middle-income|\bLMIC/i.test(text);

    return makeOpportunity({
      source: 'wellcome',
      sourceName: 'Wellcome',
      title: a.text,
      url: a.url,
      summary,
      deadline: extractDate(text),
      status,
      lmicsRelevant: lmicRelevant,
      lmicsCanApply: lmicRelevant,
      raw: { listing: SOURCE_URL }
    });
  }).filter(x => x.title.length > 8 && !/about career stages|research funding/i.test(x.title));

  return dedupe(items);
}

exports.handler = async () => {
  try {
    const html = await fetchText(SOURCE_URL);
    const items = parseWellcome(html);
    return jsonResponse(items, { source: 'wellcome', sourceUrl: SOURCE_URL, parser: 'html-links' });
  } catch (err) { return errorResponse('wellcome', err); }
};

exports._parse = parseWellcome;
