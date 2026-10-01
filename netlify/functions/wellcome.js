const {
  fetchText, stripHtml, extractAnchors, absoluteUrl, extractH1, extractMeta,
  makeOpportunity, jsonResponse, errorResponse, dedupe, extractAmount, inferTopics
} = require('./_shared');

const SOURCE_URL = 'https://wellcome.org/research-funding/schemes?sort_by=scheme_accepting_applications';
const BASE_URL = 'https://wellcome.org';
const CORE_SCHEMES = [
  'https://wellcome.org/research-funding/schemes/wellcome-early-career-awards',
  'https://wellcome.org/research-funding/schemes/wellcome-career-development-awards',
  'https://wellcome.org/research-funding/schemes/wellcome-discovery-awards'
];

function discoverSchemeUrls(html) {
  const urls = new Set(CORE_SCHEMES);
  for (const a of extractAnchors(html, BASE_URL)) {
    if (/\/research-funding\/schemes\/[a-z0-9-]+\/?(?:\?|$)/i.test(a.url)) urls.add(a.url.split('?')[0].replace(/\/$/, ''));
  }
  const rawRe = /(?:https:\/\/wellcome\.org)?(\/research-funding\/schemes\/[a-z0-9-]+)/gi;
  let m;
  while ((m = rawRe.exec(html)) !== null) urls.add(absoluteUrl(m[1], BASE_URL).replace(/\/$/, ''));
  return [...urls].filter(u => !/-closed(?:$|\/)/i.test(u));
}

function labelledValue(text, label, nextLabels) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const next = nextLabels.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`${escaped}\\s*:?\\s*([\\s\\S]{1,500}?)(?=${next ? `(?:${next})` : '$'})`, 'i');
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

function careerStagesFromText(text, title) {
  const explicit = stripHtml(text);
  const out = [];
  if (/Early-career researcher/i.test(explicit) || /early-career/i.test(title)) out.push('early-career');
  if (/Mid-career researcher/i.test(explicit) || /career development/i.test(title)) out.push('mid-career');
  if (/Established researcher/i.test(explicit) || /Discovery Awards/i.test(title)) out.push('established');
  if (/Postdoctoral|postdoc/i.test(explicit)) out.push('postdoctoral');
  if (/Postgraduate|doctoral programme/i.test(explicit)) out.push('student');
  return [...new Set(out)];
}

function parseWellcomeScheme(html, url) {
  const text = stripHtml(html);
  const title = extractH1(html) || extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title');
  if (!title || /privacy|cookie|terms/i.test(title) || /this scheme is now closed/i.test(text)) return null;

  const description = extractMeta(html, 'description') || extractMeta(html, 'og:description') || '';
  const careerText = labelledValue(text, 'Lead applicant career stage', ['Administering organisation location', 'Frequency', 'Funding amount', 'Funding duration', 'Coapplicants']);
  const locationText = labelledValue(text, 'Administering organisation location', ['Frequency', 'Funding amount', 'Funding duration', 'Coapplicants', 'Strategic programme']);
  const frequency = labelledValue(text, 'Frequency', ['Funding amount', 'Funding duration', 'Coapplicants', 'Strategic programme', 'Location eligibility']);
  const amountText = labelledValue(text, 'Funding amount', ['Funding duration', 'Coapplicants', 'Strategic programme', 'Location eligibility']);
  const strategic = labelledValue(text, 'Strategic programme', ['Frequency', 'Coapplicants', 'Key dates', 'Location eligibility']);

  const locationGlobal = /anywhere in the world\s*\(apart from mainland china\)/i.test(locationText);
  const locationLmic = /low- or middle-income|low- and middle-income|low- or middle income|LMIC/i.test(locationText);
  const explicitlyOpen = /open to new applications|open to applications/i.test(text);
  const rolling = /apply anytime|applications are accepted year-round|accepted on a rolling basis/i.test(`${frequency} ${text}`);
  const upcoming = /upcoming application stage|opening soon/i.test(text);

  let status = 'unknown';
  let recordType = 'open-call';
  if (rolling || explicitlyOpen) { status = 'open'; recordType = rolling ? 'evergreen-scheme' : 'open-call'; }
  else if (upcoming) { status = 'upcoming'; recordType = 'upcoming-call'; }

  const careerStage = careerStagesFromText(careerText, title);
  const topics = inferTopics(`${strategic} ${title} ${description}`);
  const amount = amountText ? stripHtml(amountText).slice(0, 350) : extractAmount(text);
  const canApply = locationLmic || locationGlobal ? true : null;
  const lmicRelevant = locationLmic || locationGlobal || /low- or middle-income|LMIC/i.test(text);
  const canLead = locationLmic ? true : (locationGlobal ? true : null);

  return makeOpportunity({
    source: 'wellcome', sourceName: 'Wellcome', title, url,
    summary: description || text.slice(0, 650), status, recordType,
    deadlineType: rolling ? 'rolling' : 'unknown',
    deadlineLabel: rolling ? (/apply anytime/i.test(`${frequency} ${text}`) ? 'Apply anytime' : 'Rolling basis') : null,
    opportunityType: /career development|early-career awards/i.test(title) ? ['career-development', 'research-grant'] : ( /doctoral programmes/i.test(title) ? ['training', 'research-grant'] : ['research-grant']),
    careerStage,
    topics,
    geography: locationLmic ? ['LMIC'] : (locationGlobal ? ['Global'] : []),
    lmicsRelevant: lmicRelevant,
    lmicsCanApply: canApply,
    lmicsCanLead: canLead,
    eligibilityVerified: Boolean(locationLmic || locationGlobal),
    eligibilityNotes: (locationLmic || locationGlobal) ? 'Eligibility is based on Wellcome administering-organisation location rules shown on the scheme page; check the current scheme page for application-date-specific requirements.' : null,
    fundingAmount: amount,
    raw: { listing: SOURCE_URL, frequency: stripHtml(frequency), careerStageText: stripHtml(careerText), locationText: stripHtml(locationText), strategicProgramme: stripHtml(strategic) }
  });
}

exports.handler = async () => {
  try {
    let listing = '';
    try { listing = await fetchText(SOURCE_URL); } catch (_) {}
    const urls = discoverSchemeUrls(listing).slice(0, 30);
    const results = await Promise.allSettled(urls.map(async url => parseWellcomeScheme(await fetchText(url), url)));
    const items = dedupe(results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value))
      .filter(x => x.status === 'open' || x.status === 'upcoming');
    const failed = results.filter(r => r.status === 'rejected').length;
    return jsonResponse(items, { source: 'wellcome', sourceUrl: SOURCE_URL, parser: 'scheme-pages-v3', discoveredUrls: urls.length, failedPages: failed, fallbackCoreSchemes: CORE_SCHEMES.length });
  } catch (err) { return errorResponse('wellcome', err); }
};
exports._discover = discoverSchemeUrls;
exports._parseScheme = parseWellcomeScheme;
