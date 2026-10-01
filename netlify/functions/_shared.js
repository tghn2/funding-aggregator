const crypto = require('crypto');

const DEFAULT_TIMEOUT_MS = 12000;

function decodeEntities(text = '') {
  return String(text)
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripHtml(text = '') {
  return decodeEntities(String(text)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
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
        'User-Agent': 'TGHN-Global-Health-Funding/0.2 (+https://www.tghn.org)',
        'Accept': 'text/html,application/xhtml+xml,application/xml,application/rss+xml,application/json;q=0.9,*/*;q=0.8',
        ...headers
      }
    });
    if (!response.ok) throw new Error(`Upstream returned ${response.status} for ${url}`);
    return await response.text();
  } finally { clearTimeout(timer); }
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
    /(?:deadline|closing date|application deadline|full application|preliminary application|due date|closes?|submission deadline)\s*:?\s*([0-3]?\d\s+[A-Za-z]{3,9}\s+20\d{2}(?:\s*,?\s*\d{1,2}:\d{2}\s*(?:GMT|BST|CET|CEST|ET|UTC)?)?)/i,
    /(?:deadline|closing date|application deadline|full application|preliminary application|due date|closes?|submission deadline)\s*:?\s*([A-Za-z]{3,9}\s+[0-3]?\d,?\s+20\d{2})/i,
    /([0-3]?\d\s+[A-Za-z]{3,9}\s+20\d{2})/i,
    /([A-Za-z]{3,9}\s+[0-3]?\d,?\s+20\d{2})/i
  ];
  for (const re of patterns) {
    const m = clean.match(re);
    if (m) return parseDateLoose(m[1]);
  }
  return null;
}

function extractDeadlineLabel(text = '') {
  const clean = stripHtml(text);
  if (/no deadline\s*-?\s*apply anytime|apply anytime|applications are accepted year-round/i.test(clean)) return 'Apply anytime';
  const vary = clean.match(/(?:application )?deadlines? vary[^.]{0,160}/i);
  if (vary) return vary[0].trim();
  if (/rolling basis/i.test(clean)) return 'Rolling basis';
  return null;
}

function extractAmount(text = '') {
  const clean = stripHtml(text);
  const m = clean.match(/(?:funding amount|award|budget|up to|worth)\s*:?\s*((?:US\$|USD|£|€|CAD\$|C\$)\s?[\d,.]+(?:\s*(?:million|m|thousand|k))?(?:\s*(?:to|-)\s*(?:US\$|USD|£|€|CAD\$|C\$)?\s?[\d,.]+(?:\s*(?:million|m|thousand|k))?)?)/i)
    || clean.match(/((?:US\$|USD|£|€|CAD\$|C\$)\s?[\d,.]+(?:\s*(?:million|m|thousand|k))?)/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

function extractMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? decodeEntities(m[1]).trim() : '';
}

function extractH1(html) {
  const m = String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? stripHtml(m[1]) : '';
}

function inferCareerStage(text = '') {
  const t = stripHtml(text).toLowerCase();
  const out = [];
  if (/early[- ]career/.test(t)) out.push('early-career');
  if (/mid[- ]career|career development award/.test(t)) out.push('mid-career');
  if (/established researcher|senior researcher|research leader|leading a research programme/.test(t)) out.push('established');
  if (/postdoctoral|postdoc/.test(t)) out.push('postdoctoral');
  if (/postgraduate|masters|master\b|phd|doctoral|student/.test(t)) out.push('student');
  return [...new Set(out)];
}

function inferOpportunityType(text = '') {
  const t = stripHtml(text).toLowerCase();
  const out = [];
  if (/travel award|travel grant|travel support/.test(t)) out.push('travel-award');
  if (/fellowship|fellow\b/.test(t)) out.push('fellowship');
  if (/career development|career award/.test(t)) out.push('career-development');
  if (/training|capacity build|capacity strengthen|scholarship|studentship/.test(t)) out.push('training');
  if (/prize|challenge/.test(t)) out.push('challenge');
  if (/grant|research and innovation|research award|funding|call for|expressions? of interest|concept notes?/.test(t)) out.push('research-grant');
  return [...new Set(out.length ? out : ['research-grant'])];
}

function inferTopics(text = '') {
  const t = stripHtml(text).toLowerCase();
  const map = [
    ['infectious-disease', /infectious|infection|tuberculosis|\btb\b|malaria|hiv|aids|pathogen|viral|bacterial|parasit|diarrhoeal|respiratory tract infection/],
    ['health-systems', /health system|primary health|healthcare delivery|implementation research|health services/],
    ['climate-and-health', /climate.*health|health.*climate/],
    ['mental-health', /mental health|psycholog|psychiatr|anxiety|depression|psychosis/],
    ['amr', /antimicrobial resistance|\bamr\b/],
    ['pandemic-preparedness', /pandemic|preparedness|outbreak|epidemic|surveillance/],
    ['digital-health', /digital health|artificial intelligence|\bai\b|digital innovation|digital mental/],
    ['maternal-child-health', /maternal|newborn|neonatal|child health|paediatric|pediatric|women and children/],
    ['sexual-reproductive-health', /sexual and reproductive|reproductive health/],
    ['one-health', /one health|zoonotic|zoonoses/],
    ['vaccines', /vaccine|vaccination|immuni[sz]/],
    ['diagnostics', /diagnostic|sequencing|genomic/],
    ['nutrition', /nutrition|malnutrition|food system/]
  ];
  return map.filter(([, re]) => re.test(t)).map(([tag]) => tag);
}

function isHealthRelevant(text = '') {
  const t = stripHtml(text).toLowerCase();
  return /health|medical|medicine|disease|clinical|public health|epidemi|healthcare|biomedical|biology|nutrition|mental|reproductive|maternal|child|vaccine|diagnostic|pathogen|infection|malaria|tuberculosis|hiv|one health|pharmac|genomic/.test(t);
}

function statusFromDeadline(deadline, fallback = 'unknown') {
  if (!deadline) return fallback;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.getTime() >= Date.now() ? 'open' : 'closed';
}

function makeOpportunity(opts) {
  const {
    source, sourceName, title, url, summary = '', publishedAt = null,
    deadline = null, deadlineLabel = null, status = 'unknown', recordType = 'open-call',
    callType = null, opportunityType, careerStage, topics, geography = [],
    lmicsRelevant = null, lmicsCanApply = null, lmicsCanLead = null,
    eligibilityVerified = false, eligibilityNotes = null,
    fundingAmount = null, applicationOpenDate = null, raw = {}
  } = opts;
  const combined = `${title || ''} ${summary || ''}`;
  return {
    schemaVersion: 2,
    id: stableId(source, url, title),
    source,
    sourceName,
    title: stripHtml(title || ''),
    url,
    summary: stripHtml(summary || '').slice(0, 1200),
    publishedAt: publishedAt || null,
    applicationOpenDate: applicationOpenDate || null,
    deadline: deadline || extractDate(combined),
    deadlineLabel: deadlineLabel || extractDeadlineLabel(combined),
    status,
    recordType,
    callType,
    opportunityType: opportunityType || inferOpportunityType(combined),
    careerStage: careerStage || inferCareerStage(combined),
    topics: topics || inferTopics(combined),
    geography,
    lmicsRelevant,
    lmicsCanApply,
    lmicsCanLead,
    eligibilityVerified: Boolean(eligibilityVerified),
    eligibilityNotes,
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
    body: JSON.stringify({ items, meta: { count: items.length, schemaVersion: 2, ...meta } })
  };
}

function errorResponse(source, err, extra = {}) {
  const message = err && err.name === 'AbortError' ? 'Upstream request timed out' : (err && err.message) || String(err);
  console.error(`[${source}]`, message);
  return jsonResponse([], { source, error: message, ...extra }, 502);
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

function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.id || item.url;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractNextData(html) {
  const m = String(html).match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try { return JSON.parse(decodeEntities(m[1])); }
  catch { return null; }
}

function walkObjects(value, fn, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  fn(value);
  if (Array.isArray(value)) value.forEach(v => walkObjects(v, fn, seen));
  else Object.values(value).forEach(v => walkObjects(v, fn, seen));
}

module.exports = {
  absoluteUrl, decodeEntities, dedupe, errorResponse, extractAnchors, extractAmount,
  extractDate, extractDeadlineLabel, extractH1, extractMeta, extractNextData, fetchText,
  inferCareerStage, inferOpportunityType, inferTopics, isHealthRelevant, jsonResponse,
  makeOpportunity, parseDateLoose, parseRss, stableId, statusFromDeadline, stripHtml,
  walkObjects
};
