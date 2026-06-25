// The container for all the Pict-Section-DataImport related code.
//
// pict-section-dataimport is an embeddable, configurable data-import wizard. A host registers the
// provider and calls createImportWizard(hash, config) to drop the whole flow into its UI:
//   1. Upload a CSV / TSV / Excel / fixed-width file (pict-section-upload).
//   2. Validate + detect its schema (columns, sample rows, fixed-width boundaries).
//   3. Map source columns to a target schema (a live Meadow entity schema, or a host-config schema).
//   4. Generate comprehensions (meadow-integration's browser-safe transform engine).
//   5. Push them — records via the browser EntityProvider, or one POST to a Comprehension endpoint.
// The step container is pict-section-accordion (wizard / accordion / stepper). All four extension
// points — Parser, Schema, Push, State — are host-swappable seams.

const PictProviderDataImport = require('./providers/Pict-Provider-DataImport.js');
const PictViewDataImportWizard = require('./views/PictView-DataImport-Wizard.js');

const DataImportComprehensionBuilder = require('./services/DataImport-ComprehensionBuilder.js');
const DataImportSession = require('./services/DataImport-Session.js');

const DataImportParserProvider = require('./seams/DataImport-ParserProvider.js');
const DataImportParserDelimited = require('./seams/DataImport-Parser-Delimited.js');
const DataImportParserFixedWidth = require('./seams/DataImport-Parser-FixedWidth.js');
const DataImportParserXlsx = require('./seams/DataImport-Parser-Xlsx.js');
const DataImportSchemaProvider = require('./seams/DataImport-SchemaProvider.js');
const DataImportPushTarget = require('./seams/DataImport-PushTarget.js');
const DataImportStateStore = require('./seams/DataImport-StateStore.js');

module.exports = PictProviderDataImport;

module.exports.PictProviderDataImport = PictProviderDataImport;
module.exports.PictViewDataImportWizard = PictViewDataImportWizard;

// Core services
module.exports.DataImportComprehensionBuilder = DataImportComprehensionBuilder;
module.exports.DataImportSession = DataImportSession;

// Seams (base classes + built-in adapters) — for hosts writing custom parsers / schema sources /
// push targets / state stores.
module.exports.ParserProvider = DataImportParserProvider;
module.exports.ParserDelimited = DataImportParserDelimited;
module.exports.ParserFixedWidth = DataImportParserFixedWidth;
module.exports.ParserXlsx = DataImportParserXlsx;
module.exports.SchemaProvider = DataImportSchemaProvider;
module.exports.SchemaProviderConfig = DataImportSchemaProvider.DataImportSchemaProviderConfig;
module.exports.PushTarget = DataImportPushTarget;
module.exports.PushTargetComprehension = DataImportPushTarget.DataImportPushTargetComprehension;
module.exports.StateStore = DataImportStateStore;
module.exports.StateStoreMemory = DataImportStateStore.DataImportStateStoreMemory;
module.exports.StateStoreLocal = DataImportStateStore.DataImportStateStoreLocal;

// The Meadow seam adapters are loaded lazily by the provider (they require the engine), but exposed
// here for direct use.
module.exports.getMeadowAdapters = () => require('./providers/Pict-Provider-DataImport-Meadow.js');

module.exports.default_configuration = PictProviderDataImport.default_configuration;
