# Watch Party
`npm i && npm start` → open http://localhost:3000, create a room, share the code or `/?r=CODE` link. Test: `npm test` (server running).

## Design
- **Server-authoritative state** per room: `{url,playing,pos,at(server ms),v}`. Every play/pause/seek/load is applied in arrival order (single-threaded) and broadcast; concurrent actions resolve as last-writer-wins with a monotonically increasing `v`.
- **Clock sync**: clients ping every 2 s; offset = server time − (send time + RTT/2), using the lowest-RTT sample.
- **Position** = `pos + (now_server − at)` while playing, so late joiners and reconnects get a full snapshot and land at the right spot.
- **Drift**: checked every 1 s. >300 ms → hard seek; 50–300 ms → playbackRate 0.95/1.05; else 1.0. Target steady-state drift is well under 500 ms.
- **Reconnect**: stable client id in localStorage, auto-reconnect, 30 s grace before removal. Host disconnect → immediate failover to another connected user; host can also transfer manually.
- Features: invite link/code, fuzzy search + category/rating filters (client-side catalog of sample videos), emoji reactions, chat, shared playlist, polls, host-only load/next.

## Failure handling
Invalid room/room full → error message; malformed JSON ignored; stale socket replaced on rejoin; empty rooms deleted.

## Latency measurements
`npm test` runs 12 clients and 300 control ops (10 ms apart) on one machine, reports p50/p95/max and late-join correctness. The UI also shows live control RTT and drift. Paste your results here:
| Condition | p50 | p95 | max |
|---|---|---|---|
| localhost, 12 clients | _run it_ | _run it_ | _run it_ |
Caveat: loopback test excludes real network jitter and video buffering; hard seeks depend on the browser's seek speed.
