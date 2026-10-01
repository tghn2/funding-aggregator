const crypto = require('crypto');

const DEFAULT_TIMEOUT_MS = 12000;

function decodeEntities(text = '') {
  return String(text)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripHtml(text = '') {
  return decodeEntities(String(text)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteUrl(href, baseUrl) {
  if (!href) return '';
  try { return new URL(decodeEntities(href), baseUrl).toString(); }
  catch { return ''; }
}

function stableId(source, url, title = '') {
  const input = `${source}|${url || ''}|${title || ''}`.toLowerCase().trim();
  return `${source}_${crypto.createHash('sha256').update(input).digest('hex').slice(0, 20)}`;
}

async function fetchText(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'TGHN-Global-Health-Funding/0.1 (+https://www.tghn.org)',
        'Accept': 'text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.9,*/*;q=0.8',
        ...headers
      }
    });
    if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseDateLoose(value) {
  const text = stripHtml(value || '');
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function extractDate(text = '') {
  const clean = stripHtml(text);
  const patterns = [
    /(?:deadline|closing date|application deadline|due date|closes?|submission deadline)\s*:?\s*([0-3]?\d\s+[A-Za-z]{3,9}\s+20\d{2}(?:\s*,?\s*\d{1,2}:\d{2}\s*(?:GMT|BST|CET|CEST|ET|UTC)?)?)/i,
    /(?:deadline|closing date|application deadline|due date|closes?|submission deadline)\s*:?\s*([A-Za-z]{3,9}\s+[0-3]?\d,?\s+20\d{2})/i,
    /([0-3]?\d\s+[A-Za-z]{3,9}\s+20\d{2})/i,
    /([A-Za-z]{3,9}\s+[0-3]?\d,?\s+20\d{2})/i
  ];
  for (const re of patterns) {
    const m = clean.match(re);
    if (m) return parseDateLoose(m[1]);
  }
  return null;
}

function extractAmount(text = '') {
  const clean = stripHtml(text);
  const m = clean.match(/(?:funding amount|award|budget|up to|worth)\s*:?\s*((?:US\$|USD|£|€|CAD\$|C\$)\s?[\d,.]+(?:\s*(?:million|m|thousand|k))?)/i)
    || clean.match(/((?:US\$|USD|£|€|CAD\$|C\$)\s?[\d,.]+(?:\s*(?:million|m|thousand|k))?)/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

function inferCareerStage(text = '') {
  const t = stripHtml(text).toLowerCase();
  const out = [];
  if (/early[- ]career|doctoral student|phd|postgraduate/.test(t)) out.push('early-career');
  if (/mid[- ]career|career development/.test(t)) out.push('mid-career');
  if (/established researcher|senior researcher|research leader/.test(t)) out.push('established');
  if (/postdoctoral|postdoc/.test(t)) out.push('postdoctoral');
  if (/student|postgraduate|masters|master\b|phd|doctoral/.test(t)) out.push('student');
  return [...new Set(out)];
}

function inferOpportunityType(text = '') {
  const t = stripHtml(text).toLowerCase();
  const out = [];
  if (/fellowship|fellow\b/.test(t)) out.push('fellowship');
  if (/career development|career award/.test(t)) out.push('career-development');
  if (/training|capacity build|capacity strengthen|scholarship|studentship/.test(t)) out.push('training');
  if (/travel award|travel grant|conference support/.test(t)) out.push('travel-award');
  if (/prize|challenge/.test(t)) out.push('challenge');
  if (/grant|research and innovation|research award|funding|call for proposals/.test(t)) out.push('research-grant');
  return [...new Set(out.length ? out : ['research-grant'])];
}

function inferTopics(text = '') {
  const t = stripHtml(text).toLowerCase();
  const map = [
    ['infectious-disease', /infectious|infection|tuberculosis|\btb\b|malaria|hiv|aids|pathogen|viral|bacterial|parasit/],
    ['health-systems', /health system|primary health|healthcare delivery|implementation research/],
    ['climate-and-health', /climate.*health|health.*climate/],
    ['mental-health', /mental health|psycholog|psychiatr/],
    ['amr', /antimicrobial resistance|\bamr\b/],
    ['pandemic-preparedness', /pandemic|preparedness|outbreak|epidemic|surveillance/],
    ['digital-health', /digital health|artificial intelligence|\bai\b|digital innovation/],
    ['maternal-child-health', /maternal|newborn|neonatal|child health|paediatric|pediatric/],
    ['sexual-reproductive-health', /sexual and reproductive|reproductive health/],
    ['one-health', /one health|zoonotic|zoonoses/],
    ['vaccines', /vaccine|vaccination|immuni[sz]/],
    ['diagnostics', /diagnostic|sequencing|genomic/]
  ];
  return map.filter(([, re]) => re.test(t)).map(([tag]) => tag);
}

function inferLmic(text = '') {
  const t = stripHtml(text).toLowerCase();
  const relevant = /low[- ]and middle[- ]income|\blmic|global south|sub[- ]saharan africa|developing (?:countries|regions)|african region|countries where these diseases are prevalent/.test(t);
  const canLead = /lead applicant.*(?:low[- ]and middle[- ]income|lmic|africa)|principal applicant.*(?:africa|global south)|only applicants from the african region|organisations? in .*sub[- ]saharan africa/.test(t);
  return { relevant, canApply: relevant, canLead };
}

function makeOpportunity({ source, sourceName, title, url, summary = '', publishedAt = null, deadline = null, status = 'unknown', opportunityType, careerStage, topics, geography, lmicsRelevant, lmicsCanApply, lmicsCanLead, fundingAmount = null, raw = {} }) {
  const combined = `${title || ''} ${summary || ''}`;
  const lmic = inferLmic(combined);
  return {
    id: stableId(source, url, title),
    source,
    sourceName,
    title: stripHtml(title || ''),
    url,
    summary: stripHtml(summary || '').slice(0, 900),
    publishedAt: publishedAt || null,
    deadline: deadline || extractDate(combined),
    status,
    opportunityType: opportunityType || inferOpportunityType(combined),
    careerStage: careerStage || inferCareerStage(combined),
    topics: topics || inferTopics(combined),
    geography: geography || (lmic.relevant ? ['LMIC'] : []),
    lmicsRelevant: typeof lmicsRelevant === 'boolean' ? lmicsRelevant : lmic.relevant,
    lmicsCanApply: typeof lmicsCanApply === 'boolean' ? lmicsCanApply : lmic.canApply,
    lmicsCanLead: typeof lmicsCanLead === 'boolean' ? lmicsCanLead : lmic.canLead,
    fundingAmount: fundingAmount || extractAmount(combined),
    retrievedAt: new Date().toISOString(),
    raw
  };
}

function jsonResponse(items, meta = {}, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=900, s-maxage=1800'
    },
    body: JSON.stringify({ items, meta: { count: items.length, ...meta } })
  };
}

function errorResponse(source, err) {
  const message = err && err.name === 'AbortError' ? 'Upstream request timed out' : (err && err.message) || String(err);
  console.error(`[${source}]`, message);
  return jsonResponse([], { source, error: message }, 502);
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = re.exec(block);
  if (!m) return '';
  const raw = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(raw);
  return cdata ? cdata[1].trim() : raw;
}

function parseRss(xml) {
  const items = [];
  const itemRe = /<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    const title = stripHtml(extractTag(block, 'title'));
    let link = stripHtml(extractTag(block, 'link') || extractTag(block, 'guid'));
    if (!link) {
      const lm = block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
      if (lm) link = decodeEntities(lm[1]);
    }
    const description = stripHtml(extractTag(block, 'description') || extractTag(block, 'summary') || extractTag(block, 'content:encoded') || extractTag(block, 'content'));
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'dc:date') || extractTag(block, 'updated') || extractTag(block, 'published');
    items.push({ title, link, description, pubDate });
  }
  return items;
}

function extractAnchors(html, baseUrl) {
  const out = [];
  const re = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = stripHtml(m[4]);
    const url = absoluteUrl(m[2], baseUrl);
    if (text && url) out.push({ text, url, index: m.index, html: m[0] });
  }
  return out;
}

function windowAround(html, index, radius = 1800) {
  return html.slice(Math.max(0, index - radius), Math.min(html.length, index + radius));
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.url || item.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = {
  absoluteUrl, decodeEntities, dedupe, errorResponse, extractAnchors, extractAmount,
  extractDate, fetchText, inferCareerStage, inferLmic, inferOpportunityType, inferTopics,
  jsonResponse, makeOpportunity, parseDateLoose, parseRss, stableId, stripHtml, windowAround
};
