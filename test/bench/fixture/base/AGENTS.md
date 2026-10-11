# AGENTS.md

Parcel tracker: follows parcels across several carriers, rolls deliveries up into weekly
reports and tells customers when something changes.

## Layout

- `src/poller/` asks carriers for news and stores it
- `src/carriers/` carrier ids, status mapping and the transport the poller uses
- `src/report/` weekly roll-ups and the finance export
- `src/notifier/` customer messages
- `src/api/` request handlers (reports, parcels, webhooks)
- `src/util/` small shared helpers
- `config/`, `docs/`, `snapshots/`, `scripts/`

## Conventions

- Erasable TypeScript only (Node 24 runs `.ts` directly): no enums, namespaces or parameter
  properties. Imports name the `.ts` extension.
- No dependencies beyond `node:` built-ins. No network access.
- British spelling in prose.

## Tests

Run `npm test`. Tests use `node --test`.
