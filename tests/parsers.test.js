const assert = require('assert');
const fogarty = require('../netlify/functions/fogarty');
const idrc = require('../netlify/functions/idrc');
const grand = require('../netlify/functions/grandchallenges');
const wellcome = require('../netlify/functions/wellcome');
const tdr = require('../netlify/functions/tdr');

const fogartyHtml = `<table><tr><td>December 3, 2099</td><td><a href="https://grants.nih.gov/x">Emerging Global Leader Award (K43)</a></td><td>International Research Career Development Award</td></tr></table>`;
const f = fogarty._parse(fogartyHtml, new Date('2099-01-01'));
assert.equal(f.length, 1);
assert.deepEqual(f[0].careerStage, ['early-career']);
assert.equal(f[0].lmicsCanLead, true);

const idrcHtml = `<h2>Open calls</h2><div><a href="/en/funding/health-call">Call for proposals: Health systems in Africa</a><span>Deadline: December 31, 2099</span></div><h2>Closed calls</h2><div><a href="/en/funding/old">Old call</a></div>`;
const i = idrc._discover(idrcHtml);
assert.equal(i.length, 1);
assert.equal(i[0].deadline.slice(0, 10), '2099-12-31');

const gcHtml = `<main>Grant Opportunities <h3>Keystone Symposia: Funding Opportunities for 2027 Conferences</h3><div>Initiative</div><div>Keystone Symposia Global Health Series</div><div>Applications Open</div><div>Description</div><p>Scientists from low- and middle-income countries can receive Global Health Travel Awards. Application deadlines vary from August 25, 2099 through January 9, 2100.</p><a>Learn More</a></main>`;
const g = grand._parse(gcHtml);
assert.equal(g.length, 1);
assert.equal(g[0].lmicsCanApply, true);
assert(g[0].opportunityType.includes('travel-award'));

const wHtml = `<html><head><meta name="description" content="Funding for early-career researchers to develop their research identity."></head><body><h1>Wellcome Early-Career Awards</h1><p>Lead applicant career stage: Early-career researcher Administering organisation location: UK, Republic of Ireland, Low- or middle-income countries Frequency: Apply anytime - Applications are accepted year-round Funding amount: Your salary and up to £400,000 for research expenses. Funding duration: Usually 5 years Coapplicants: Not accepted</p></body></html>`;
const w = wellcome._parseScheme(wHtml, 'https://wellcome.org/research-funding/schemes/wellcome-early-career-awards');
assert.equal(w.status, 'open');
assert.equal(w.deadlineLabel, 'Apply anytime');
assert.equal(w.lmicsCanLead, true);

const tdrHtml = `<p>Open calls for applications</p><a href="https://example.org/etdr?Open_Call">eTDR portal</a><a href="/home/our-work/strengthening-research-capacity/postgraduate-training-scheme">Postgraduate training scheme</a>`;
assert.equal(tdr._parse(tdrHtml).length, 0);
assert(tdr._findPortalUrl(tdrHtml));

console.log('Parser smoke tests passed');
