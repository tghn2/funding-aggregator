const {
  fetchText, stripHtml, extractAnchors, absoluteUrl, extractH1, extractMeta,
  makeOpportunity, jsonResponse, errorResponse, dedupe, extractAmount, inferTopics
} = require('./_shared');

const SOURCE_URL = 'https://wellcome.org/research-funding/schemes?sort_by=scheme_accepting_applications';
const BASE_URL = 'https://wellcome.org';

// Reliable fallback for the three core Discovery Research schemes. Dynamic discovery from
// the funding finder is attempted first, so additional scheme URLs are picked up when present
// in Wellcome's rendered or embedded HTML.
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

function parseWellcomeScheme(html, url) {
  const text = stripHtml(html);
  const title = extractH1(html) || extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title');
  if (!title || /closed\)?$/i.test(title) || /this scheme is now closed/i.test(text)) return null;

  const description = extractMeta(html, 'description') || extractMeta(html, 'og:description') || text.slice(0, 650);
  const careerText = labelledValue(text, 'Lead applicant career stage', ['Administering organisation location', 'Frequency', 'Funding amount', 'Funding duration', 'Coapplicants']);
  const locationText = labelledValue(text, 'Administering organisation location', ['Frequency', 'Funding amount', 'Funding duration', 'Coapplicants', 'Strategic programme']);
  const frequency = labelledValue(text, 'Frequency', ['Funding amount', 'Funding duration', 'Coapplicants', 'Strategic programme', 'Location eligibility']);
  const amountText = labelledValue(text, 'Funding amount', ['Funding duration', 'Coapplicants', 'Strategic programme', 'Location eligibility']);
  const strategic = labelledValue(text, 'Strategic programme', ['Frequency', 'Coapplicants', 'Key dates', 'Location eligibility']);

  const applyAnytime = /apply anytime|applications are accepted year-round|no deadlines? for applications/i.test(text) || /apply anytime/i.test(frequency);
  const explicitlyOpen = /open to new applications|open to applications/i.test(text);
  const upcoming = /upcoming application stage|opening soon/i.test(text);
  const status = (applyAnytime || explicitlyOpen) ? 'open' : (upcoming ? 'upcoming' : 'unknown');
  const recordType = applyAnytime ? 'evergreen-scheme' : (status === 'upcoming' ? 'upcoming-call' : 'open-call');
  const hasLmic = /low- or middle-income|low- and middle-income|low- or middle income/i.test(locationText || text);

  let careerStage = [];
  if (/early-career/i.test(careerText)) careerStage.push('early-career');
  if (/mid-career/i.test(careerText)) careerStage.push('mid-career');
  if (/established researcher|leading a research programme/i.test(careerText)) careerStage.push('established');
  if (/postdoctoral/i.test(careerText)) careerStage.push('postdoctoral');
  if (/postgraduate/i.test(careerText)) careerStage.push('student');

  const topics = inferTopics(`${strategic} ${title} ${description}`);
  const amount = amountText ? stripHtml(amountText).slice(0, 350) : extractAmount(text);

  return makeOpportunity({
    source: 'wellcome', sourceName: 'Wellcome', title, url,
    summary: description, status, recordType,
    deadline: null,
    deadlineLabel: applyAnytime ? 'Apply anytime' : null,
    opportunityType: /career/i.test(title) ? ['career-development', 'research-grant'] : ['research-grant'],
    careerStage,
    topics,
    geography: hasLmic ? ['LMIC'] : [],
    lmicsRelevant: hasLmic || /low- or middle-income|LMIC/i.test(text),
    lmicsCanApply: hasLmic ? true : null,
    lmicsCanLead: hasLmic ? true : null,
    eligibilityVerified: hasLmic,
    eligibilityNotes: hasLmic ? 'Lead applicants can be based at eligible administering organisations in specified LMICs; Wellcome location rules can change by application date, so applicants should verify the current scheme page.' : null,
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
    return jsonResponse(items, { source: 'wellcome', sourceUrl: SOURCE_URL, parser: 'scheme-pages-v2', discoveredUrls: urls.length, failedPages: failed, fallbackCoreSchemes: CORE_SCHEMES.length });
  } catch (err) { return errorResponse('wellcome', err); }
};
exports._discover = discoverSchemeUrls;
exports._parseScheme = parseWellcomeScheme;
