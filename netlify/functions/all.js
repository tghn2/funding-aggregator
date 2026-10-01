const { jsonResponse, dedupe } = require('./_shared');

const adapters = {
  fogarty: require('./fogarty'),
  wellcome: require('./wellcome'),
  edctp3: require('./edctp3'),
  tdr: require('./tdr'),
  idrc: require('./idrc'),
  grandchallenges: require('./grandchallenges')
};

exports.handler = async () => {
  const names = Object.keys(adapters);
  const results = await Promise.allSettled(names.map(async source => {
    const response = await adapters[source].handler({});
    const data = JSON.parse(response.body || '{"items":[],"meta":{}}');
    if (response.statusCode >= 400) throw new Error(`${source}: ${data.meta && data.meta.error || response.statusCode}`);
    return { source, data };
  }));

  const items = [];
  const sources = {};
  for (let i = 0; i < results.length; i++) {
    const sourceName = names[i];
    const r = results[i];
    if (r.status === 'fulfilled') {
      const sourceItems = r.value.data.items || [];
      items.push(...sourceItems);
      sources[sourceName] = { ok: true, count: sourceItems.length, meta: r.value.data.meta || {} };
    } else {
      sources[sourceName] = { ok: false, error: String(r.reason && r.reason.message || r.reason) };
    }
  }

  const unique = dedupe(items).filter(item => item.status === 'open' || item.status === 'upcoming');
  unique.sort((a, b) => {
    const ad = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
    return ad - bd;
  });
  return jsonResponse(unique, { source: 'all', sources, filtering: 'open/upcoming only', sort: 'deadline' });
};
