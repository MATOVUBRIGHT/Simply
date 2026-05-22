Summary: Exponential backoff for background sync

Files changed:
- client/src/services/sync.ts

What changed:
- Replaced fixed 30s setInterval with adaptive scheduler using setTimeout.
- Default base interval increased to 2 minutes (`SYNC_INTERVAL_MS = 120000`).
- On repeated failures, interval doubles (exponential backoff) up to 30 minutes (`MAX_BACKOFF_MS`).
- Added jitter (~±25%) to avoid thundering herd.
- Backoff resets on a successful sync.

Why:
- Reduce Supabase request usage and avoid hitting free-tier limits.

Notes & next steps:
- Consider tuning `SYNC_INTERVAL_MS` and `MAX_BACKOFF_MS` based on observed behavior.
- Optionally expose these values as runtime config.
- Run further load tests to measure request reduction.
