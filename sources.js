// Public source registry for the first funding-dashboard MVP.
// endpoint values are Netlify Function URLs consumed by the frontend.
window.FUNDING_SOURCES = [
  { id: 'fogarty', name: 'NIH Fogarty', endpoint: '/.netlify/functions/fogarty', priority: 1, lmicsFocus: true, globalHealthFocus: true },
  { id: 'wellcome', name: 'Wellcome', endpoint: '/.netlify/functions/wellcome', priority: 1, lmicsFocus: true, globalHealthFocus: true },
  { id: 'edctp3', name: 'Global Health EDCTP3', endpoint: '/.netlify/functions/edctp3', priority: 1, lmicsFocus: true, africaFocus: true, globalHealthFocus: true },
  { id: 'tdr', name: 'WHO/TDR', endpoint: '/.netlify/functions/tdr', priority: 1, lmicsFocus: true, globalHealthFocus: true },
  { id: 'idrc', name: 'IDRC', endpoint: '/.netlify/functions/idrc', priority: 1, lmicsFocus: true, globalHealthFocus: true },
  { id: 'grandchallenges', name: 'Grand Challenges', endpoint: '/.netlify/functions/grandchallenges', priority: 1, lmicsFocus: true, globalHealthFocus: true }
];
