# pict-section-dataimport

An embeddable, configurable **data-import wizard** for Pict apps. A host registers the provider and
calls `createImportWizard(hash, config)` to drop the whole flow into its UI:

1. **Upload** a CSV / TSV / Excel / fixed-width file ([pict-section-upload](../pict-section-upload)).
2. **Validate** — detect columns, sample rows, fixed-width boundaries.
3. **Map** source columns to a target schema — a live **Meadow** entity schema, or a **complex
   non-Meadow schema supplied in host config**.
4. **Generate** comprehensions — reusing [meadow-integration](../../meadow/meadow-integration)'s
   browser-safe transform engine (Solvers + one-row-to-many fan-out).
5. **Push** — records via the browser `EntityProvider` (GUID marshaling + FK resolution), **or** one
   POST of the whole comprehension to a `/Comprehension/Push` endpoint.

The step container is [pict-section-accordion](../pict-section-accordion) (wizard / accordion /
stepper). Everything follows the [Pict theme criteria](../pict-section-theme) — themed CSS at
priority 500.

## Install

```bash
npm install pict-section-dataimport
```

Peers: `pict`, `pict-section-upload`, `pict-section-accordion`, and `meadow-integration` (its
browser-safe engine re-export is used to build comprehensions — see "Engine" below). Optional peers:
`xlsx` (only for Excel import), `pict-section-modal`, `pict-section-form`, `pict-section-recordset`.

## Usage

```javascript
const libDataImport = require('pict-section-dataimport');
pict.addProvider('Pict-Section-DataImport', libDataImport.default_configuration, libDataImport);

pict.providers['Pict-Section-DataImport'].createImportWizard('BooksImport',
{
    DestinationAddress: '#BooksImport',
    RenderMode: 'wizard',                 // 'wizard' | 'accordion' | 'stepper'

    // Target schema (step 3)
    SchemaSource: 'meadow',               // 'meadow' | 'config' | a SchemaProvider | (ctx)=>Promise
    MeadowEntities: [ 'Book', 'Author', 'BookAuthorJoin' ],   // when 'meadow'
    Schema: { Entities: [ ... ], Order: [ ... ] },           // when 'config'
    URLPrefix: '/1.0/',

    // Push (step 5)
    PushMode: 'entityprovider',           // 'entityprovider' | 'comprehension' | a PushTarget | (comp,ctx)=>Promise
    GUIDPrefix: 'BOOKSIMPORT',            // pin per app/env — same prefix => idempotent upserts
    AllowGUIDTruncation: true,            // truncate the prefix if a marshaled GUID exceeds the column
    ComprehensionPushURL: '/1.0/Comprehension/Push',   // when PushMode 'comprehension'

    // A starting mapping the user can edit (entities, GUID templates, fan-out Solvers)
    DefaultMapping: { Order: [...], Entities: { ... } },

    // Persistence (resume a partially-mapped session)
    StateStore: 'memory',                 // 'memory' | 'localStorage' | a StateStore
    PersistenceHook: { save, load, list, remove },        // overrides StateStore (server persistence)

    AllowedFileTypes: [ 'csv', 'tsv', 'xlsx', 'fixedwidth' ],
    OnStepChange, OnSchemaLoaded, OnComprehension, OnPushComplete, OnError,
});
pict.views['BooksImport'].render();
```

## Seams (all host-swappable)

| Seam | Built-ins | Swap by |
|---|---|---|
| **ParserProvider** | csv, tsv, fixed-width, xlsx (lazy) | `Parsers: { kind: instance }` |
| **SchemaProvider** | Meadow `/Schema` fetch, host-config descriptor | `SchemaSource: instance \| (ctx)=>Promise` |
| **PushTarget** | EntityProvider records, Comprehension POST | `PushMode: instance \| (comp,ctx)=>Promise` |
| **StateStore** | memory, localStorage, PersistenceHook | `StateStore: instance` |

The mapping → comprehension step + the EntityProvider push reuse `meadow-integration`'s engine; both
are reached through the browser-clean `Meadow-Integration-Engine.js` re-export, so **no server-only
code (orator / the meadow ORM / DB drivers / xlsx) enters the bundle** — there's a test that asserts this.

## Comprehension generation (the core)

`DataImportComprehensionBuilder.build(mapping, rows)` runs the canonical
`MeadowIntegrationTabularTransform.transformRecord` per row, so the output is byte-identical to what
the `meadow-integration` CLI produces from the same mapping files — including `Solvers` +
`MultipleGUIDUniqueness` fan-out (one CSV row → a Book + N Authors + N joins). Entities are emitted in
`Mapping.Order` (referenced-before-referrer); `validateForeignKeyOrder()` flags any FK that would
resolve to NULL.

## Examples

- **`example_applications/books_import`** — imports a books CSV into the quackage sqlite bookstore
  harness (Meadow schema, EntityProvider push, the bookstore fan-out mapping). Verified end-to-end:
  3 rows → 3 Books + 4 Authors + 5 joins with resolved foreign keys, idempotent on re-run.
- **`example_applications/archive_import`** — generates **Archive.org-shaped** comprehensions for a
  complex, non-Meadow schema defined entirely in app config: `ArchiveItem` ↔ `ArchiveCollection`
  many-to-many (fan-out from a `;`-delimited collection column), modeled on a real archive.org item
  (the public-domain General Mills Monster Cereals commercials). Generate, preview, download the JSON.

## Test

```bash
npm test     # mocha TDD — core engine integration, parsers, seams, dependency boundary, wizard wiring
```

## Note on the mapping / preview UI

v1 ships the wizard's own themed, pict-templated mapping editor (per-field source-column selects +
a raw-JSON escape hatch for fan-out/FK rules) and a generated-record preview table. Swapping in
`pict-section-form` (descriptor-driven mapping) or `pict-section-recordset` (paged preview) is a
documented next step — the seams + serializable session state make it additive.
