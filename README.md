# Global Health Funding Netlify Adapters v2

Second-generation, dependency-free Netlify Functions for the Global Health Research Funding dashboard.

## What changed from v1

The v1 adapters proved that all six authoritative sources were reachable, but production output exposed several false-positive patterns. v2 is intentionally conservative: a source returns an empty `items` array rather than turning a navigation page, closed archive, award announcement, or project extension into a live funding opportunity.

### Common schema additions

Every item now includes:

- `schemaVersion: 2`
- `recordType`: `open-call`, `upcoming-call`, or `evergreen-scheme`
- tri-state eligibility fields: `true`, `false`, or `null`
- `eligibilityVerified`
- `eligibilityNotes`
- `deadlineLabel` for rolling/apply-anytime opportunities
- `callType` where known

The public dashboard should normally show `status === "open" || status === "upcoming"` and should treat `null` eligibility as “not yet verified”, not “No”.

## Source behavior

### Fogarty
Parses the official funding table, drops expired rows, and corrects the LMIC/career classification for LMIC-focused K43-style awards.

### Wellcome
Attempts to discover scheme URLs from the funding finder, then parses individual scheme pages. If the finder does not expose URLs in raw HTML, it falls back to the three core Discovery Research schemes: Early-Career, Career Development, and Discovery Awards.

### Global Health EDCTP3
Uses the official RSS feed as a discovery feed. It excludes project-mobilisation notices and historical programme years, deduplicates results, and leaves lead eligibility as `null` unless verified.

### WHO/TDR
Emits only links that are clearly specific open calls. It deliberately does **not** turn evergreen programme links (Postgraduate Training, Clinical Research Leadership, Impact Grants, TDR Explorer) into live opportunities. The response metadata contains the eTDR portal URL when discoverable.

### IDRC
Parses only the page's **Open calls** section, follows each current call page, and emits only health-relevant calls. This prevents deadline/topic bleed from the Closed calls list.

### Grand Challenges
Prefers embedded `__NEXT_DATA__` structured data and falls back to a visible-text opportunity parser. Utility links such as Privacy Policy and Terms of Use are explicitly excluded.

## Endpoints

- `/.netlify/functions/fogarty`
- `/.netlify/functions/wellcome`
- `/.netlify/functions/edctp3`
- `/.netlify/functions/tdr`
- `/.netlify/functions/idrc`
- `/.netlify/functions/grandchallenges`
- `/.netlify/functions/all` — optional convenience aggregate

## Frontend compatibility

Existing frontend fields (`title`, `url`, `summary`, `deadline`, `status`, `opportunityType`, etc.) remain present. Update LMIC badges so:

- `true` = verified/positive
- `false` = explicitly ineligible
- `null` = not verified from the source

Recommended default feed filter:

```js
items.filter(item => item.status === 'open' || item.status === 'upcoming');
```

Do not assume an item with `status: "unknown"` is open.
