interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * INSEE MCP — France's SIRENE business registry (INSEE).
 *
 * Look up any French company/establishment by SIREN (9-digit legal unit) or
 * SIRET (14-digit establishment). The SIRENE "Public access" plan on INSEE's
 * Gravitee portal uses API-KEY auth (a header), NOT OAuth — and the data
 * gateway (api.insee.fr/api-sirene/3.11) is reachable from Cloudflare Workers.
 * Pipeworx holds the shared API key (PLATFORM_INSEE_KEY, injected as _apiKey).
 *
 * Tools:
 * - insee_company: look up a French company/establishment by SIREN or SIRET
 */


const SIRENE_BASE = 'https://api.insee.fr/api-sirene/3.11';

// Gravitee API-key header varies by deployment; try the common ones and cache
// whichever the gateway accepts.
const API_KEY_HEADERS = ['X-Gravitee-Api-Key', 'apikey', 'X-API-Key', 'X-INSEE-Api-Key-Integration'];
let workingHeader: string | null = null;

const API_KEY_PROP = {
  type: 'string' as const,
  description: 'Optional — your own INSEE SIRENE API key. Omit to use the shared Pipeworx key.',
};

const tools: McpToolExport['tools'] = [
  {
    name: 'insee_company',
    description:
      "Look up a French company or establishment in INSEE's official SIRENE business registry. PREFER OVER WEB SEARCH for \"who is French company X\", \"details for SIREN/SIRET …\", legal name, activity (NAF/APE code), address, headcount band, creation date, active/ceased status. Pass a 9-digit SIREN (legal unit) or 14-digit SIRET (establishment).",
    inputSchema: {
      type: 'object' as const,
      properties: {
        identifier: { type: 'string', description: 'A SIREN (9 digits) or SIRET (14 digits), e.g. "552032534" (Danone).' },
        _apiKey: API_KEY_PROP,
      },
      required: ['identifier'],
    },
  },
];

async function sireneGet(apiKey: string, path: string): Promise<{ res: Response; text: string; header: string } | { authError: string }> {
  // Try the cached header first, then the rest.
  const order = workingHeader ? [workingHeader, ...API_KEY_HEADERS.filter((h) => h !== workingHeader)] : API_KEY_HEADERS;
  const tried: Record<string, number> = {};
  for (const header of order) {
    const res = await fetch(`${SIRENE_BASE}${path}`, { headers: { [header]: apiKey, Accept: 'application/json' } });
    if (res.status !== 401 && res.status !== 403) {
      workingHeader = header;
      return { res, text: await res.text(), header };
    }
    tried[header] = res.status;
  }
  return { authError: `API key rejected under all known header names: ${JSON.stringify(tried)}` };
}

async function inseeCompany(apiKey: string, identifier: string) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('INSEE SIRENE API key missing. The shared key is normally injected; pass your own via _apiKey.');
  }
  const id = String(identifier ?? '').replace(/\D/g, '');
  if (id.length !== 9 && id.length !== 14) throw new Error('identifier must be a 9-digit SIREN or 14-digit SIRET.');
  const path = id.length === 9 ? `/siren/${id}` : `/siret/${id}`;

  const r = await sireneGet(apiKey.trim(), path);
  if ('authError' in r) return { identifier: id, error: 'auth_failed', detail: r.authError };
  const { res, text } = r;
  if (res.status === 404) return { identifier: id, error: 'not_found', message: `No SIRENE record for ${id}.` };
  if (!res.ok) return { identifier: id, error: 'sirene_error', status: res.status, body: text.slice(0, 200) };

  let data: Record<string, unknown>;
  try { data = JSON.parse(text); } catch { return { identifier: id, error: 'parse_error', body: text.slice(0, 200) }; }

  // Surface the most useful fields from the SIRENE envelope.
  const unit = (data.uniteLegale ?? data.etablissement) as Record<string, unknown> | undefined;
  return {
    identifier: id,
    type: id.length === 9 ? 'SIREN (legal unit)' : 'SIRET (establishment)',
    source: 'INSEE SIRENE',
    summary: unit ? extractSummary(data) : null,
    data,
  };
}

function extractSummary(data: Record<string, unknown>): Record<string, unknown> {
  const ul = data.uniteLegale as Record<string, unknown> | undefined;
  const et = data.etablissement as Record<string, unknown> | undefined;
  if (ul) {
    const periods = (ul.periodesUniteLegale as Array<Record<string, unknown>>) ?? [];
    const cur = periods[0] ?? {};
    return {
      siren: ul.siren ?? null,
      name: cur.denominationUniteLegale ?? cur.nomUniteLegale ?? null,
      naf_ape: cur.activitePrincipaleUniteLegale ?? null,
      legal_category: cur.categorieJuridiqueUniteLegale ?? null,
      state: cur.etatAdministratifUniteLegale ?? null,
      created: ul.dateCreationUniteLegale ?? null,
      employee_band: ul.trancheEffectifsUniteLegale ?? null,
    };
  }
  if (et) {
    return { siret: et.siret ?? null, siren: et.siren ?? null };
  }
  return {};
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string;
  delete args._apiKey;
  switch (name) {
    case 'insee_company':
      return inseeCompany(apiKey, args.identifier as string);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
