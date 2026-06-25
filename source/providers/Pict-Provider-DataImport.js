const libPictProvider = require('pict-provider');

const libPictViewWizard = require('../views/PictView-DataImport-Wizard.js');
const libComprehensionBuilder = require('../services/DataImport-ComprehensionBuilder.js');
const libDataImportCSS = require('../Pict-Section-DataImport-CSS.js');

const libParserDelimited = require('../seams/DataImport-Parser-Delimited.js');
const libParserFixedWidth = require('../seams/DataImport-Parser-FixedWidth.js');
const libParserXlsx = require('../seams/DataImport-Parser-Xlsx.js');
const libSchemaProvider = require('../seams/DataImport-SchemaProvider.js');
const libPushTarget = require('../seams/DataImport-PushTarget.js');
const libStateStore = require('../seams/DataImport-StateStore.js');

/** @type {Record<string, any>} */
const _DEFAULT_CONFIGURATION =
{
	ProviderIdentifier: 'Pict-Section-DataImport',

	AutoInitialize: true,
	AutoInitializeOrdinal: 0,
};

/**
 * The pict-section-dataimport provider — the embeddable API surface. Registers the wizard CSS, then
 * createImportWizard(hash, config) drops the whole upload -> validate -> map -> generate -> push flow
 * into the host's DOM. The four seams (Parser / Schema / Push / State) are normalized here from
 * strings, instances, or functions into live objects the wizard view consumes.
 */
class PictProviderDataImport extends libPictProvider
{
	constructor(pFable, pOptions, pServiceHash)
	{
		let tmpOptions = Object.assign({}, _DEFAULT_CONFIGURATION, pOptions);
		super(pFable, tmpOptions, pServiceHash);

		if (this.pict && this.pict.CSSMap && typeof this.pict.CSSMap.addCSS === 'function')
		{
			this.pict.CSSMap.addCSS('Pict-Section-DataImport-CSS', libDataImportCSS, 500);
		}
		this._meadowAdapter = null;
	}

	/** Lazily require the Meadow seam adapters (only when a Meadow schema source / EntityProvider push is used). */
	_meadow()
	{
		if (!this._meadowAdapter) { this._meadowAdapter = require('./Pict-Provider-DataImport-Meadow.js'); }
		return this._meadowAdapter;
	}

	/**
	 * Create (or reconfigure + reuse) an embedded import wizard.
	 * @param {string} pWizardHash @param {Record<string, any>} pConfig
	 * @return {any} The wizard view instance.
	 */
	createImportWizard(pWizardHash, pConfig)
	{
		const tmpConfig = Object.assign(
			{
				DestinationAddress: `#${pWizardHash}`,
				RenderMode: 'wizard',
				URLPrefix: '/1.0/',
				GUIDPrefix: 'INTG-DEF',
				EntityGUIDPrefix: '',
				AllowGUIDTruncation: false,
				AllowedFileTypes: [ 'csv', 'tsv', 'xlsx', 'fixedwidth' ],
				SchemaSource: 'meadow',
				PushMode: 'entityprovider',
				StateStore: 'memory',
			},
			pConfig || {},
			{ WizardHash: pWizardHash });

		// Resolve the seams onto the config — the wizard view reads these directly.
		tmpConfig.ResolvedParsers = this._resolveParsers(tmpConfig);
		tmpConfig.ResolvedSchemaProvider = this._resolveSchemaProvider(tmpConfig);
		tmpConfig.ResolvedPushTarget = this._resolvePushTarget(tmpConfig);
		tmpConfig.ResolvedStateStore = this._resolveStateStore(tmpConfig);
		tmpConfig.ComprehensionBuilder = new libComprehensionBuilder(this.pict);

		if (this.pict.views[pWizardHash])
		{
			Object.assign(this.pict.views[pWizardHash].options, tmpConfig);
			return this.pict.views[pWizardHash];
		}
		return this.pict.addView(pWizardHash, tmpConfig, libPictViewWizard);
	}

	/** Build the parser registry { kind: instance }, merging any host-supplied custom parsers. */
	_resolveParsers(pConfig)
	{
		const tmpParsers =
		{
			csv: new libParserDelimited(this.pict, { Kind: 'csv' }),
			tsv: new libParserDelimited(this.pict, { Kind: 'tsv' }),
			fixedwidth: new libParserFixedWidth(this.pict, {}),
			xlsx: new libParserXlsx(this.pict, {}),
		};
		if (pConfig.Parsers && typeof pConfig.Parsers === 'object')
		{
			Object.keys(pConfig.Parsers).forEach((pKind) => { tmpParsers[pKind] = pConfig.Parsers[pKind]; });
		}
		return tmpParsers;
	}

	/** Normalize SchemaSource: 'meadow' | 'config' | instance | function(ctx)->Promise<schema>. */
	_resolveSchemaProvider(pConfig)
	{
		const tmpSource = pConfig.SchemaSource;
		if (tmpSource && typeof tmpSource.getSchema === 'function') { return tmpSource; }
		if (typeof tmpSource === 'function') { return { getSchema: (pContext) => Promise.resolve(tmpSource(pContext)) }; }
		if (tmpSource === 'meadow')
		{
			return new (this._meadow().DataImportSchemaProviderMeadow)(this.pict, { MeadowEntities: pConfig.MeadowEntities || [], URLPrefix: pConfig.URLPrefix });
		}
		// default: a config-supplied schema descriptor
		return new libSchemaProvider.DataImportSchemaProviderConfig(this.pict, { Schema: pConfig.Schema || { Entities: [] } });
	}

	/** Normalize PushMode: 'entityprovider' | 'comprehension' | instance | function(comp,ctx)->Promise<result>. */
	_resolvePushTarget(pConfig)
	{
		const tmpMode = pConfig.PushMode;
		if (tmpMode && typeof tmpMode.push === 'function') { return tmpMode; }
		if (typeof tmpMode === 'function') { return { push: (pComprehension, pContext) => Promise.resolve(tmpMode(pComprehension, pContext)) }; }
		if (tmpMode === 'entityprovider')
		{
			return new (this._meadow().DataImportPushTargetEntityProvider)(this.pict, {});
		}
		// default: POST the whole comprehension to an endpoint
		return new libPushTarget.DataImportPushTargetComprehension(this.pict, { URL: pConfig.ComprehensionPushURL });
	}

	/** Normalize StateStore: 'memory' | 'localStorage' | instance, or a PersistenceHook on the config. */
	_resolveStateStore(pConfig)
	{
		if (pConfig.PersistenceHook && typeof pConfig.PersistenceHook.save === 'function')
		{
			return new libStateStore.DataImportStateStoreHook(this.pict, { Hook: pConfig.PersistenceHook });
		}
		const tmpStore = pConfig.StateStore;
		if (tmpStore && typeof tmpStore.save === 'function') { return tmpStore; }
		if (tmpStore === 'localStorage') { return new libStateStore.DataImportStateStoreLocal(this.pict, { KeyPrefix: pConfig.StateStoreKeyPrefix }); }
		return new libStateStore.DataImportStateStoreMemory(this.pict, {});
	}
}

module.exports = PictProviderDataImport;

module.exports.default_configuration = _DEFAULT_CONFIGURATION;
