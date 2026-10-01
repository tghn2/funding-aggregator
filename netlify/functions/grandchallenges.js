const { fetchText, stripHtml, extractAnchors, windowAround, makeOpportunity, jsonResponse, errorResponse, dedupe, extractDate } = require('./_shared');

const SOURCE_URL = 'https://www.grandchallenges.org/grant-opportunities';
const BASE_URL = 'https://www.grandchallenges.org';

function parseGrandChallenges(html) {
  const anchors = extractAnchors(html, BASE_URL).filter(a => {
    const lower = a.text.toLowerCase();
    const isUtility = /learn more|apply|read more|grant opportunities|home|about|contact/.test(lower);
    return !isUtility && a.text.length > 20;
  });

  const items = anchors.map(a => {
    const context = windowAround(html, a.index, 2200);
    const text = stripHtml(context);
    if (!/initiative|applications open|description|grand challenge/i.test(text)) return null;
    const status = /applications open/i.test(text) ? 'open' : (/applications closed|closed/i.test(text) ? 'closed' : 'unknown');
    const summaryMatch = text.match(/Description\s+([\s\S]{50,700}?)(?=Learn More|$)/i);
    const summary = summaryMatch ? summaryMatch[1] : text.slice(0, 650);
    const lmicsRelevant = /low- and middle-income|low- or middle-income|\bLMIC|global health|developing/i.test(`${a.text} ${summary}`);
    return makeOpportunity({
      source: 'grandchallenges',
      sourceName: 'Grand Challenges',
      title: a.text,
      url: a.url,
      summary,
      deadline: extractDate(text),
      status,
      lmicsRelevant,
      lmicsCanApply: lmicsRelevant,
      raw: { listing: SOURCE_URL }
    });
  }).filter(Boolean);

  return dedupe(items);
}

exports.handler = async () => {
  try {
    const html = await fetchText(SOURCE_URL);
    const items = parseGrandChallenges(html);
    return jsonResponse(items, { source: 'grandchallenges', sourceUrl: SOURCE_URL, parser: 'html-cards' });
  } catch (err) { return errorResponse('grandchallenges', err); }
};

exports._parse = parseGrandChallenges;
