const assert = require('assert');
const fogarty = require('../netlify/functions/fogarty')._parse;
const edctp3 = require('../netlify/functions/edctp3')._parse;
const wellcome = require('../netlify/functions/wellcome')._parse;
const idrc = require('../netlify/functions/idrc')._parse;
const grand = require('../netlify/functions/grandchallenges')._parse;
const tdr = require('../netlify/functions/tdr')._parse;

const fog = fogarty(`<table><tr><td>December 3, 2026</td><td><a href="https://grants.nih.gov/x">Emerging Global Leader Award</a></td><td>International Research Career Development Award</td></tr></table>`);
assert.equal(fog.length, 1); assert.equal(fog[0].status, 'open');

const ed = edctp3(`<rss><channel><item><title>Training networks for sustained capacity building</title><link>https://ec.europa.eu/test</link><description>Status Open. Sub-Saharan Africa.</description><pubDate>Wed, 03 Dec 2025 00:00:00 GMT</pubDate></item></channel></rss>`);
assert.equal(ed.length, 1); assert.equal(ed[0].source, 'edctp3');

const wel = wellcome(`<article><a href="/research-funding/schemes/wellcome-early-career-awards">Wellcome Early-Career Awards</a><p>Apply anytime</p><p>This scheme provides funding for early-career researchers.</p><p>Administering organisation location: Low- or middle-income countries</p></article>`);
assert.equal(wel.length, 1); assert.equal(wel[0].status, 'open'); assert.equal(wel[0].lmicsRelevant, true);

const id = idrc(`<section><h2>Open calls</h2><a href="/en/funding/call-health-africa">Call for proposals: Health research in Africa</a><p>Deadline: September 25, 2026</p></section>`);
assert.equal(id.length, 1); assert.equal(id[0].source, 'idrc');

const gc = grand(`<article><h3><a href="/grant/test">Innovations in Low-Cost Pathogen Sequencing Workflows</a></h3><div>Initiative Grand Challenges Applications Open Description This initiative supports routine public health use in LMICs. Learn More</div></article>`);
assert.equal(gc.length, 1); assert.equal(gc[0].status, 'open');

const td = tdr(`<main><a href="https://etdr.who.int/">Open calls for applications - eTDR portal</a><a href="/training/postgraduate">TDR Postgraduate Scholarship in Implementation Research</a></main>`);
assert(td.length >= 2); assert(td.some(x => /open calls/i.test(x.title)));

console.log('All parser tests passed');
