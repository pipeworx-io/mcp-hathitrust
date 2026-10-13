# @pipeworx/hathitrust

HathiTrust's digitized-book holdings by standard identifier (OCLC, LCCN, ISSN,
ISBN, HathiTrust item id, catalog record number): the bibliographic record plus
every scanned copy, each flagged full-view (readable online) or limited
(search-only).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1784+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

## Tools

- `lookup_by_identifier(id_type, id)`: records and scanned copies for one identifier.
- `get_record(record_number)`: one catalog record with full bibliographic metadata.
- `check_full_view(id_type, id)`: whether a readable copy exists, with reading URLs.

## Auth

Keyless upstream, but **accounts only on Pipeworx**. The manifest row carries
`accountOnly: true`, so the gateway refuses anonymous callers and callers that
send only an `X-API-Key` (BYO with no account) with `account_required` and a
link to https://pipeworx.io/signup?via=hathitrust. OAuth and paid Bearer-token
accounts, x402 payers and internal traffic (`X-Pipeworx-Internal`, so the
monitor) keep full access. The refusal happens before the pack runs, so no
request reaches HathiTrust for a refused caller.

Why (Bruce ruled 2026-10-13, fleet #2964): a residential proxy pool of ~171k IPs
was enumerating HathiTrust's catalogue by OCLC number through REST
`/v1/tools/lookup_by_identifier`, about 600k calls an hour, every IP kept under
its per-IP limit. The pack had seen about 2 genuine calls a day. Per-IP limits
cannot stop that shape, and an `X-API-Key` is never validated, so it is no
identity either. The risk was HathiTrust blocking our egress for every caller.
An account is the cheapest identity that cannot be minted in bulk.

Lifting it is a one-line manifest change (drop `accountOnly`), then
`node scripts/sync-pack-manifest.mjs`. Ask Bruce first. The gate itself lives in
`workers/gateway/src/account-only.ts`.

## Data sources

- HathiTrust Digital Library, Bibliographic API: catalog records and per-copy
  rights codes.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "hathitrust": {
      "url": "https://gateway.pipeworx.io/hathitrust/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/hathitrust/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1784+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/lookup_by_identifier \
  -H 'Content-Type: application/json' \
  -d '{"id_type":"isbn","id":"9780030110405"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/lookup_by_identifier`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

```json
{
  "mcpServers": {
    "hathitrust": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-hathitrust"]
    }
  }
}
```

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-hathitrust
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Hathitrust data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
