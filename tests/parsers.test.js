const assert = require('assert');
const fogarty = require('../netlify/functions/fogarty');
const wellcome = require('../netlify/functions/wellcome');
const edctp3 = require('../netlify/functions/edctp3');
const tdr = require('../netlify/functions/tdr');
const idrc = require('../netlify/functions/idrc');
const grand = require('../netlify/functions/grandchallenges');

const future = new Date('2099-01-01');

const fogartyHtml = `<table><tr><td>December 3, 2099</td><td><a href="https://grants.nih.gov/x">Emerging Global Leader Award (K43)</a></td><td>International Research Career Development Award</td></tr></table>`;
const f = fogarty._parse(fogartyHtml, future);
assert.equal(f.length, 1);
assert.deepEqual(f[0].careerStage, ['early-career']);
assert.equal(f[0].lmicsCanLead, true);
assert.equal(f[0].deadlineType, 'fixed');

const wHtml = `<html><head><meta name="description" content="Funding for early-career researchers to develop their research identity."></head><body><h1>Wellcome Early-Career Awards</h1><p>Lead applicant career stage: Early-career researcher Administering organisation location: UK, Republic of Ireland, Low- or middle-income countries Frequency: Apply anytime - Applications are accepted year-round Funding amount: Your salary and up to £400,000 for research expenses.</p></body></html>`;
const w = wellcome._parseScheme(wHtml, 'https://wellcome.org/research-funding/schemes/wellcome-early-career-awards');
assert.equal(w.status, 'open');
assert.equal(w.deadlineType, 'rolling');
assert.deepEqual(w.careerStage, ['early-career']);
assert.equal(w.lmicsCanLead, true);

const edctpXml = `<rss><channel><item><title>Future call for global health</title><link>https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-JU-GH-EDCTP3-2027-01-X</link><description>Deadline: December 31, 2099</description><pubDate>Tue, 01 Dec 2098 12:00:00 GMT</pubDate></item></channel></rss>`;
const e = edctp3._parse(edctpXml, future);
assert.equal(e.length, 1);
assert.equal(e[0].status, 'open');

const closedEdctpXml = `<rss><channel><item><title>2026 call</title><link>https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-JU-GH-EDCTP3-2026-01-X</link><description>Deadline: September 1, 2026</description></item></channel></rss>`;
assert.equal(edctp3._parse(closedEdctpXml, new Date('2026-10-01')).length, 0);

const tdrHtml = `<p>Open calls</p><a href="https://example.org/etdr">eTDR portal</a><a href="/home/our-work/strengthening-research-capacity/postgraduate-training-scheme">Postgraduate training scheme</a>`;
assert.equal(tdr._parse(tdrHtml, future).length, 0);

const idrcHtml = `<h2>Open calls</h2><div><a href="/en/funding/health-call">Call for proposals: Health systems in Africa</a></div><h2>Closed calls</h2><div><a href="/en/funding/old">Old call</a></div>`;
assert.equal(idrc._discover(idrcHtml).length, 1);

const gcHtml = `<main><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"items":[{"title":"Keystone Symposia: Funding Opportunities for 2027 Conferences","description":"Global Health Travel Awards for scientists from low- and middle-income countries. Application deadlines vary from August 25, 2026 through January 9, 2027.","status":"open","initiative":"Keystone Symposia Global Health Series","url":"https://www.grandchallenges.org/grant-opportunities"}]}}}</script></main>`;
const g = grand._parse(gcHtml, new Date('2026-10-01'));
assert.equal(g.length, 1);
assert.equal(g[0].deadlineType, 'varies');
assert.equal(g[0].lmicsCanApply, true);
assert(g[0].opportunityType.includes('travel-award'));

console.log('v3 parser smoke tests passed');
