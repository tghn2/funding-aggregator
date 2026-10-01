const { jsonResponse } = require('./_shared');

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
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const sourceItems = r.value.data.items || [];
      items.push(...sourceItems);
      sources[r.value.source] = { ok: true, count: sourceItems.length, meta: r.value.data.meta || {} };
    } else {
      const message = String(r.reason && r.reason.message || r.reason);
      const source = message.split(':')[0] || 'unknown';
      sources[source] = { ok: false, error: message };
    }
  }

  const unique = [...new Map(items.map(x => [x.id, x])).values()];
  return jsonResponse(unique, { source: 'all', sources });
};
