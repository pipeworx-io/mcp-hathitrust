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
 * HathiTrust Bibliographic API MCP.
 *
 * Keyless lookup of HathiTrust's 18M+ digitized books (catalog.hathitrust.org).
 * Returns bibliographic records plus the list of scanned copies for each item,
 * and — crucially — which copies are full-view (readable online) vs limited
 * (search-only), derived from each copy's rights code. Keyless.
 */


const BASE = 'https://catalog.hathitrust.org/api';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const ID_TYPES = ['oclc', 'lccn', 'issn', 'isbn', 'htid', 'recordnumber'] as const;
type IdType = (typeof ID_TYPES)[number];

const tools: McpToolExport['tools'] = [
  {
    name: 'lookup_by_identifier',
    description:
      "Look up HathiTrust's digitized-book holdings by a standard identifier (OCLC, LCCN, ISSN, ISBN, HathiTrust item id, or catalog record number). Returns the bibliographic record(s) plus every scanned copy, each flagged full-view (readable online) or limited (search-only) based on its rights code. Keyless — covers 18M+ volumes.",
    inputSchema: {
      type: 'object',
      properties: {
        id_type: {
          type: 'string',
          description: 'Identifier type. One of: oclc, lccn, issn, isbn, htid, recordnumber.',
          enum: [...ID_TYPES],
        },
        id: {
          type: 'string',
          description: 'The identifier value, e.g. "424023" for an OCLC number, "9780030110405" for an ISBN.',
        },
      },
      required: ['id_type', 'id'],
    },
  },
  {
    name: 'get_record',
    description:
      'Get a single HathiTrust catalog record by its record number, with the full structured bibliographic metadata (titles, ISBNs, ISSNs, OCLCs, LCCNs, publish dates, record URL) and the complete list of scanned copies flagged full-view vs limited. e.g. record_number "009166282" ("A manual for the study of insects"). Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        record_number: {
          type: 'string',
          description:
            'A HathiTrust catalog record number, e.g. "009166282". Obtain one from lookup_by_identifier (the record_number field).',
        },
      },
      required: ['record_number'],
    },
  },
  {
    name: 'check_full_view',
    description:
      'Convenience check: given an identifier, report whether a readable (full-view) scanned copy exists on HathiTrust, how many copies are readable, and direct reading URLs. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        id_type: {
          type: 'string',
          description: 'Identifier type. One of: oclc, lccn, issn, isbn, htid, recordnumber.',
          enum: [...ID_TYPES],
        },
        id: {
          type: 'string',
          description: 'The identifier value, e.g. "2364951" for an OCLC number.',
        },
      },
      required: ['id_type', 'id'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'lookup_by_identifier':
        return lookupByIdentifier(args);
      case 'get_record':
        return getRecord(args);
      case 'check_full_view':
        return checkFullView(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Map a HathiTrust rights code → human meaning + whether it grants full (readable) view. */
function rightsMeaning(code: string): { meaning: string; full_view: boolean } {
  const c = (code || '').toLowerCase();
  // Full view — readable online.
  if (
    c === 'pd' ||
    c === 'pdus' ||
    c === 'world' ||
    c === 'cc-zero' ||
    c === 'ic-world' ||
    c.startsWith('cc-by')
  ) {
    return { meaning: 'Full view — readable online', full_view: true };
  }
  // Limited / search-only.
  if (c === 'ic') return { meaning: 'Limited (search-only)', full_view: false };
  if (c === 'und') return { meaning: 'Undetermined', full_view: false };
  if (c === 'op' || c === 'orph' || c === 'orphcand') return { meaning: 'Limited (out of print / orphan)', full_view: false };
  if (c === 'nobody') return { meaning: 'Limited (not available)', full_view: false };
  // Unknown code: be conservative — not full view, surface the raw code.
  return { meaning: code, full_view: false };
}

interface HtItem {
  orig?: string;
  fromRecord?: string;
  htid?: string;
  itemURL?: string;
  rightsCode?: string;
  lastUpdate?: string;
  enumcron?: string | boolean;
}

interface MappedCopy {
  htid: string | null;
  source_library: string | null;
  item_url: string | null;
  rights_code: string | null;
  access: string;
  full_view: boolean;
  volume: string | null;
  last_update: string | null;
}

/** Map the API `items` array → normalized scanned-copy records. */
function mapItems(items: HtItem[]): MappedCopy[] {
  return (Array.isArray(items) ? items : []).map((it) => {
    const r = rightsMeaning(it.rightsCode ?? '');
    return {
      htid: it.htid ?? null,
      source_library: it.orig ?? null,
      item_url: it.itemURL ?? null,
      rights_code: it.rightsCode ?? null,
      access: r.meaning,
      full_view: r.full_view,
      volume: typeof it.enumcron === 'string' && it.enumcron ? it.enumcron : null,
      last_update: it.lastUpdate ?? null,
    };
  });
}

interface HtRecord {
  recordURL?: string;
  titles?: string[];
  isbns?: string[];
  issns?: string[];
  oclcs?: string[];
  lccns?: string[];
  publishDates?: string[];
}

/** Map the API `records` object (keyed by record number) → normalized record list. */
function mapRecords(records: Record<string, HtRecord> | undefined): Array<Record<string, unknown>> {
  const entries = records && typeof records === 'object' ? Object.entries(records) : [];
  return entries.map(([recordNumber, r]) => ({
    record_number: recordNumber,
    title: Array.isArray(r.titles) ? r.titles[0] ?? null : null,
    titles: r.titles ?? [],
    record_url: r.recordURL ?? null,
    isbns: r.isbns ?? [],
    issns: r.issns ?? [],
    oclcs: r.oclcs ?? [],
    lccns: r.lccns ?? [],
    publish_dates: r.publishDates ?? [],
  }));
}

interface HtResponse {
  records?: Record<string, HtRecord>;
  items?: HtItem[];
}

async function htGet(path: string): Promise<HtResponse | { error: string }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) return { error: `HathiTrust: ${res.status} ${(await res.text()).slice(0, 200)}` };
  return (await res.json()) as HtResponse;
}

function validateIdType(raw: unknown): IdType | null {
  const t = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (ID_TYPES as readonly string[]).includes(t) ? (t as IdType) : null;
}

async function lookupByIdentifier(args: Record<string, unknown>): Promise<unknown> {
  const idType = validateIdType(args.id_type);
  if (!idType) return { error: `id_type must be one of: ${ID_TYPES.join(', ')}`, id_type: args.id_type ?? null };
  const id = typeof args.id === 'string' ? args.id.trim() : '';
  if (!id) return { error: 'provide an id', id: args.id ?? null };

  const data = await htGet(`/volumes/brief/${idType}/${encodeURIComponent(id)}.json`);
  if ('error' in data) return data;

  const records = mapRecords(data.records);
  if (records.length === 0) {
    return { count_records: 0, records: [], scanned_copies: [] };
  }
  return {
    count_records: records.length,
    records,
    scanned_copies: mapItems(data.items ?? []),
  };
}

async function getRecord(args: Record<string, unknown>): Promise<unknown> {
  const recordNumber = typeof args.record_number === 'string' ? args.record_number.trim() : '';
  if (!recordNumber) return { error: 'provide a record_number', record_number: args.record_number ?? null };

  const data = await htGet(`/volumes/full/recordnumber/${encodeURIComponent(recordNumber)}.json`);
  if ('error' in data) return data;

  const records = mapRecords(data.records);
  if (records.length === 0) {
    return { error: 'record not found', record_number: recordNumber };
  }
  // recordnumber lookup returns the single requested record.
  return {
    ...records[0],
    scanned_copies: mapItems(data.items ?? []),
  };
}

async function checkFullView(args: Record<string, unknown>): Promise<unknown> {
  const idType = validateIdType(args.id_type);
  if (!idType) return { error: `id_type must be one of: ${ID_TYPES.join(', ')}`, id_type: args.id_type ?? null };
  const id = typeof args.id === 'string' ? args.id.trim() : '';
  if (!id) return { error: 'provide an id', id: args.id ?? null };

  const data = await htGet(`/volumes/brief/${idType}/${encodeURIComponent(id)}.json`);
  if ('error' in data) return data;

  const records = mapRecords(data.records);
  if (records.length === 0) {
    return { title: null, has_full_view: false, full_view_count: 0, total_copies: 0, readable_urls: [] };
  }

  const copies = mapItems(data.items ?? []);
  const fullViewCopies = copies.filter((c) => c.full_view);
  return {
    title: (records[0].title as string | null) ?? null,
    has_full_view: fullViewCopies.length > 0,
    full_view_count: fullViewCopies.length,
    total_copies: copies.length,
    readable_urls: fullViewCopies.map((c) => c.item_url).filter((u): u is string => !!u).slice(0, 5),
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
