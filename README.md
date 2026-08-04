# mcp-hathitrust

HathiTrust Bibliographic API MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `lookup_by_identifier` | Look up HathiTrust's digitized-book holdings by a standard identifier (OCLC, LCCN, ISSN, ISBN, HathiTrust item id, or catalog record number). Returns the bibliographic record(s) plus every scanned copy, each flagged full-view (readable online) or limited (search-only) based on its rights code. Keyless — covers 18M+ volumes. |
| `get_record` | Get a single HathiTrust catalog record by its record number, with the full structured bibliographic metadata (titles, ISBNs, ISSNs, OCLCs, LCCNs, publish dates, record URL) and the complete list of scanned copies flagged full-view vs limited. e.g. record_number "009166282" ("A manual for the study of insects"). Keyless. |
| `check_full_view` | Convenience check: given an identifier, report whether a readable (full-view) scanned copy exists on HathiTrust, how many copies are readable, and direct reading URLs. Keyless. |

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

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Hathitrust data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
