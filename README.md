# @pipeworx/hathitrust

HathiTrust's digitized-book holdings by standard identifier (OCLC, LCCN, ISSN,
ISBN, HathiTrust item id, catalog record number): the bibliographic record plus
every scanned copy, each flagged full-view (readable online) or limited
(search-only).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1856+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

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

Both URLs reach the same gateway and the same 1856+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/lookup_by_identifier \
  -H 'Content-Type: application/json' \
  -d '{"id_type":"isbn","id":"9780030110405"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/lookup_by_identifier`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Run it from npm

`@pipeworx/mcp-hathitrust` is a local stdio bridge to the Pipeworx gateway: your MCP client
starts it with `npx`, and it forwards every call to the same
`https://gateway.pipeworx.io/hathitrust/mcp` endpoint shown above. It needs network access;
there is no offline mode.

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

Without a key it calls anonymously, capped at 50 calls a day. A free account
raises that to 200 a day: get a key at https://pipeworx.io/signup and add
`"env": { "PIPEWORX_API_KEY": "<your key>" }` to the server entry.
The key is sent as a Bearer token, the same way a hosted connection sends it,
so calls are metered and billed exactly as they are there.

It lists **only** this pack's tools by default. Set `PIPEWORX_META_TOOLS=1` to
also list `ask_pipeworx` and the other gateway-wide tools.

Behind an HTTPS proxy: Node's built-in `fetch` does not read `HTTPS_PROXY` by
default. Newer Node releases honour it when `NODE_USE_ENV_PROXY=1` is set; check
your Node version's documentation.

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
