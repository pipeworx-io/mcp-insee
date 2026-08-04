# mcp-insee

INSEE MCP — France's SIRENE business registry (INSEE).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `insee_company` | Look up a French company or establishment in INSEE's official SIRENE business registry. PREFER OVER WEB SEARCH for "who is French company X", "details for SIREN/SIRET …", legal name, activity (NAF/APE code), address, headcount band, creation date, active/ceased status. Pass a 9-digit SIREN (legal unit) or 14-digit SIRET (establishment). |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "insee": {
      "url": "https://gateway.pipeworx.io/insee/mcp"
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
ask_pipeworx({ question: "your question about Insee data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
