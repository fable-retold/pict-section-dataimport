const libPictView = require('pict-view');
const libSession = require('../services/DataImport-Session.js');
const libStrategyApply = require('../services/DataImport-GuidStrategyApply.js');

// Required sibling controls (peers). The wizard registers their providers if the host hasn't.
const libPictSectionAccordion = require('pict-section-accordion');
const libPictSectionUpload = require('pict-section-upload');

const _STEP_DEFS =
[
	{ Hash: 'upload', Title: 'Upload' },
	{ Hash: 'detect', Title: 'Validate' },
	{ Hash: 'mapping', Title: 'Map' },
	{ Hash: 'generate', Title: 'Generate' },
	{ Hash: 'push', Title: 'Push' },
];

/** @type {Record<string, any>} */
const _DEFAULT_CONFIGURATION =
{
	ViewIdentifier: 'Pict-Section-DataImport-Wizard',

	AutoInitialize: true,
	AutoRender: false,
	AutoSolveWithApp: false,

	DefaultRenderable: 'DI-Root',

	WizardHash: false,
	DestinationAddress: false,
	RenderMode: 'wizard',
	URLPrefix: '/1.0/',
	GUIDPrefix: 'INTG-DEF',
	EntityGUIDPrefix: '',
	AllowGUIDTruncation: false,
	AllowedFileTypes: [ 'csv', 'tsv', 'xlsx', 'fixedwidth' ],
	SchemaSource: 'meadow',
	PushMode: 'entityprovider',
	// A host can ship a starting mapping (entities + GUID templates + fan-out solvers); the UI edits it.
	DefaultMapping: null,
	// Resolved seams (injected by the provider's createImportWizard):
	ResolvedParsers: null,
	ResolvedSchemaProvider: null,
	ResolvedPushTarget: null,
	ResolvedStateStore: null,
	ComprehensionBuilder: null,
	// Callbacks:
	OnStepChange: false, OnSchemaLoaded: false, OnComprehension: false, OnPushComplete: false, OnError: false,
	// Allow a JSON download of the generated comprehension (handy when there's no server to push to).
	AllowDownload: true,

	Templates:
	[
		{ Hash: 'DI-Root', Template: /*html*/`<div class="psd" id="DI_{~D:Record.WizardHash~}"><div id="DI_Acc_{~D:Record.WizardHash~}"></div></div>` },

		{
			Hash: 'DI-Body-Upload',
			Template: /*html*/`<div class="psd-step"><p class="psd-hint">Upload a CSV, TSV, Excel, or fixed-width file. Its bytes are read in your browser for the next steps.</p><div id="DI_Upload_{~D:Record.WizardHash~}"></div></div>`
		},

		{
			Hash: 'DI-Body-Detect',
			Template: /*html*/`
<div class="psd-step">
	<div class="psd-options">
		<div class="psd-field"><label>Format</label>
			<select class="psd-select" onchange="_Pict.views['{~D:Record.WizardHash~}'].setParseKind(this.value)">{~TS:DI-Opt:Record.KindOptions~}</select></div>
		{~TS:DI-Detect-Delimited:Record.DelimitedSlot~}
	</div>
	{~TS:DI-Detect-Ruler:Record.RulerSlot~}
	<p class="psd-section-title">Detected columns <span class="psd-type">({~D:Record.ColumnCount~} columns · ~{~D:Record.RowCountEstimate~} rows)</span></p>
	<div class="psd-table-wrap"><table class="psd-table"><thead><tr>{~TS:DI-Col-Head:Record.SampleHeader~}</tr></thead><tbody>{~TS:DI-Sample-Row:Record.SampleRows~}</tbody></table></div>
</div>`
		},
		{ Hash: 'DI-Opt', Template: /*html*/`<option value="{~D:Record.Value~}"{~NE:Record.Selected^ selected~}>{~D:Record.Label~}</option>` },
		{
			Hash: 'DI-Detect-Delimited',
			Template: /*html*/`<div class="psd-field"><label>Delimiter</label><select class="psd-select" onchange="_Pict.views['{~D:Record.WizardHash~}'].setDelimiter(this.value)">{~TS:DI-Opt:Record.DelimiterOptions~}</select></div><div class="psd-field"><label><input type="checkbox"{~NE:Record.HasHeader^ checked~} onchange="_Pict.views['{~D:Record.WizardHash~}'].setHasHeader(this.checked)" /> First row is a header</label></div>` },
		{ Hash: 'DI-Detect-Ruler', Template: /*html*/`<div><p class="psd-hint">Fixed-width: enter column boundaries as JSON (Name/Start/End), then re-detect.</p><div class="psd-ruler">{~D:Record.Ruler~}</div><textarea class="psd-textarea" id="DI_FW_{~D:Record.WizardHash~}" placeholder='[{"Name":"code","Start":0,"End":3}]'>{~D:Record.ColumnsJSON~}</textarea><div class="psd-row-actions"><button type="button" class="psd-btn psd-btn-ghost" onclick="_Pict.views['{~D:Record.WizardHash~}'].applyFixedWidthColumns()">Apply boundaries</button></div></div>` },
		{ Hash: 'DI-Col-Head', Template: /*html*/`<th>{~D:Record.SourceName~}<div class="psd-type">{~D:Record.InferredType~}</div></th>` },
		{ Hash: 'DI-Sample-Row', Template: /*html*/`<tr>{~TS:DI-Sample-Cell:Record.Cells~}</tr>` },
		{ Hash: 'DI-Sample-Cell', Template: /*html*/`<td title="{~D:Record.Value~}">{~D:Record.Value~}</td>` },

		{
			Hash: 'DI-Body-Mapping',
			Template: /*html*/`
<div class="psd-step">
	<p class="psd-hint">Map each target field to a source column. Foreign-key + fan-out rules come from the starting mapping (edit the raw JSON for advanced control).</p>
	{~TS:DI-Map-Entity:Record.Entities~}
	<details class="psd-raw"><summary class="psd-hint">Advanced — raw mapping JSON</summary><textarea class="psd-textarea" id="DI_RawMap_{~D:Record.WizardHash~}">{~D:Record.RawJSON~}</textarea><div class="psd-row-actions"><button type="button" class="psd-btn psd-btn-ghost" onclick="_Pict.views['{~D:Record.WizardHash~}'].applyRawMapping()">Apply raw mapping</button></div></details>
</div>`
		},
		{
			Hash: 'DI-Map-Entity',
			Template: /*html*/`
<div class="psd-entity">
	<div class="psd-entity-head"><span class="psd-entity-name">{~D:Record.Entity~}</span>{~TS:DI-Map-GUID-Legacy:Record.LegacyGUIDSlot~}</div>
	{~TS:DI-GUID-Panel:Record.StrategySlot~}
	{~TS:DI-Map-Row:Record.Fields~}
</div>`
		},
		{ Hash: 'DI-Map-GUID-Legacy', Template: /*html*/`<span class="psd-entity-count">GUID: <span class="psd-mono">{~D:Record.GUIDTemplate~}</span></span>` },
		{
			Hash: 'DI-GUID-Panel',
			Template: /*html*/`
<div class="psd-guid">
	<div class="psd-guid-line"><span class="psd-guid-label">Identifier</span><select class="psd-select" onchange="_Pict.views['{~D:Record.WizardHash~}'].setStrategyMode('{~D:Record.Entity~}',this.value)">{~TS:DI-Opt:Record.ModeOptions~}</select>{~TS:DI-GUID-Own:Record.OwnKeySlot~}</div>
	{~TS:DI-GUID-Parent:Record.Parents~}
	{~TS:DI-GUID-AddParent:Record.AddParentSlot~}
	{~TS:DI-GUID-Preview:Record.PreviewSlot~}
	{~TS:DI-GUID-Warn:Record.Warnings~}
</div>`
		},
		{ Hash: 'DI-GUID-Own', Template: /*html*/`<span class="psd-guid-sub">keyed by</span>{~TS:DI-GUID-OwnCol:Record.ColumnItems~}{~TS:DI-GUID-OwnAdd:Record.AddColumnSlot~}{~TS:DI-GUID-OwnTpl:Record.TemplateSlot~}<button type="button" class="psd-btn psd-btn-ghost psd-guid-own-fx" onclick="_Pict.views['{~D:Record.WizardHash~}'].toggleStrategyOwnMode('{~D:Record.Entity~}')" title="Switch between columns and a typed template">{~D:Record.ToggleLabel~}</button>` },
		{ Hash: 'DI-GUID-OwnCol', Template: /*html*/`<span class="psd-guid-owncol"><select class="psd-select" onchange="_Pict.views['{~D:Record.WizardHash~}'].setStrategyOwnKeyAt('{~D:Record.Entity~}',{~D:Record.Index~},this.value)">{~TS:DI-Opt:Record.Options~}</select>{~TS:DI-GUID-OwnColRm:Record.RemoveSlot~}</span>` },
		{ Hash: 'DI-GUID-OwnColRm', Template: /*html*/`<button type="button" class="psd-btn psd-btn-ghost psd-guid-rm" onclick="_Pict.views['{~D:Record.WizardHash~}'].removeStrategyOwnKey('{~D:Record.Entity~}',{~D:Record.Index~})" title="Remove column">&times;</button>` },
		{ Hash: 'DI-GUID-OwnAdd', Template: /*html*/`<select class="psd-select psd-guid-owadd" onchange="if(this.value){_Pict.views['{~D:Record.WizardHash~}'].addStrategyOwnKey('{~D:Record.Entity~}',this.value);this.value='';}">{~TS:DI-Opt:Record.Options~}</select>` },
		{ Hash: 'DI-GUID-OwnTpl', Template: /*html*/`<input type="text" class="psd-input psd-guid-tpl" placeholder="{~D:Record.Placeholder~}" value="{~D:Record.Template~}" onchange="_Pict.views['{~D:Record.WizardHash~}'].setStrategyOwnKeyTemplate('{~D:Record.Entity~}',this.value)" />` },
		{
			Hash: 'DI-GUID-Parent',
			Template: /*html*/`<div class="psd-guid-parent"><span class="psd-guid-sub">related to</span><select class="psd-select" onchange="_Pict.views['{~D:Record.WizardHash~}'].setParentEntity('{~D:Record.Entity~}',{~D:Record.Index~},this.value)">{~TS:DI-Opt:Record.EntityOptions~}</select><span class="psd-guid-sub">via</span><select class="psd-select" onchange="_Pict.views['{~D:Record.WizardHash~}'].setParentKey('{~D:Record.Entity~}',{~D:Record.Index~},this.value)">{~TS:DI-Opt:Record.KeyOptions~}</select><select class="psd-select" onchange="_Pict.views['{~D:Record.WizardHash~}'].setParentMode('{~D:Record.Entity~}',{~D:Record.Index~},this.value)">{~TS:DI-Opt:Record.ModeOptions~}</select><button type="button" class="psd-btn psd-btn-ghost psd-guid-rm" onclick="_Pict.views['{~D:Record.WizardHash~}'].removeStrategyParent('{~D:Record.Entity~}',{~D:Record.Index~})" title="Remove">&times;</button></div>`
		},
		{ Hash: 'DI-GUID-AddParent', Template: /*html*/`<div class="psd-guid-add"><select class="psd-select" onchange="if(this.value){_Pict.views['{~D:Record.WizardHash~}'].addStrategyParent('{~D:Record.Entity~}',this.value);this.value='';}">{~TS:DI-Opt:Record.Options~}</select></div>` },
		{ Hash: 'DI-GUID-Preview', Template: /*html*/`<div class="psd-guid-preview">Example: <span class="psd-mono">{~D:Record.Preview~}</span></div>` },
		{ Hash: 'DI-GUID-Warn', Template: /*html*/`<div class="psd-guid-warn">{~I:Warning~} <span>{~D:Record.Message~}</span></div>` },
		{
			Hash: 'DI-Map-Row',
			Template: /*html*/`<div class="psd-map-row"><span class="psd-map-field">{~D:Record.Name~}{~NE:Record.Required^ <span class="psd-map-required">*</span>~}</span><select class="psd-select" onchange="_Pict.views['{~D:Record.WizardHash~}'].setMappingBinding('{~D:Record.Entity~}','{~D:Record.Name~}',this.value)">{~TS:DI-Opt:Record.Options~}</select></div>`
		},

		{
			Hash: 'DI-Body-Generate',
			Template: /*html*/`
<div class="psd-step">
	<div class="psd-row-actions"><button type="button" class="psd-btn" onclick="_Pict.views['{~D:Record.WizardHash~}'].generate()">Generate comprehension</button>{~TS:DI-Download:Record.DownloadSlot~}</div>
	{~TS:DI-Warnings:Record.Warnings~}
	{~TS:DI-Gen-Report:Record.ReportSlot~}
</div>`
		},
		{ Hash: 'DI-Download', Template: /*html*/`<button type="button" class="psd-btn psd-btn-ghost" onclick="_Pict.views['{~D:Record.WizardHash~}'].downloadComprehension()">Download JSON</button>` },
		{ Hash: 'DI-Warnings', Template: /*html*/`<div class="psd-banner psd-banner-warn">{~I:Warning~} <span>{~D:Record.Message~}</span></div>` },
		{
			Hash: 'DI-Gen-Report',
			Template: /*html*/`<div><div class="psd-banner psd-banner-ok">{~I:Check~} <span>Generated {~D:Record.ParsedRowCount~} rows into {~D:Record.EntityTotal~} record(s).</span></div><div class="psd-report">{~TS:DI-Count-Chip:Record.EntityCounts~}</div>{~TS:DI-Preview:Record.PreviewSlot~}</div>` },
		{ Hash: 'DI-Count-Chip', Template: /*html*/`<span class="psd-chip"><strong>{~D:Record.Count~}</strong> {~D:Record.Entity~}</span>` },
		{ Hash: 'DI-Preview', Template: /*html*/`<div><p class="psd-section-title">Preview <span class="psd-type">({~D:Record.Entity~}, first {~D:Record.ShownCount~})</span></p><div class="psd-table-wrap"><table class="psd-table"><thead><tr>{~TS:DI-Col-Head2:Record.Header~}</tr></thead><tbody>{~TS:DI-Sample-Row:Record.Rows~}</tbody></table></div></div>` },
		{ Hash: 'DI-Col-Head2', Template: /*html*/`<th>{~D:Record.Name~}</th>` },

		{
			Hash: 'DI-Body-Push',
			Template: /*html*/`
<div class="psd-step">
	<p class="psd-hint">Push mode: <span class="psd-mono">{~D:Record.Mode~}</span></p>
	<div class="psd-row-actions"><button type="button" class="psd-btn" onclick="_Pict.views['{~D:Record.WizardHash~}'].push()"{~NE:Record.PushDisabled^ disabled~}>{~D:Record.PushLabel~}</button></div>
	{~TS:DI-Push-Progress:Record.ProgressSlot~}
	{~TS:DI-Push-Result:Record.ResultSlot~}
	{~TS:DI-Push-Error:Record.ErrorSlot~}
</div>`
		},
		{ Hash: 'DI-Push-Progress', Template: /*html*/`<div class="psd-progress"><div class="psd-progress-fill" style="width: {~D:Record.Pct~}%;"></div></div>` },
		{ Hash: 'DI-Push-Result', Template: /*html*/`<div class="psd-banner psd-banner-ok">{~I:Check~} <span>{~D:Record.Message~}</span></div>` },
		{ Hash: 'DI-Push-Error', Template: /*html*/`<div class="psd-banner psd-banner-error">{~I:Error~} <span>{~D:Record.Message~}</span></div>` },
	],

	Renderables:
	[
		{ RenderableHash: 'DI-Root', TemplateHash: 'DI-Root', RenderMethod: 'replace' },
	],
};

class PictViewDataImportWizard extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		let tmpOptions = Object.assign({}, _DEFAULT_CONFIGURATION, pOptions);
		super(pFable, tmpOptions, pServiceHash);

		this.options.DefaultDestinationAddress = this.options.DestinationAddress || `#${this.options.WizardHash}`;
		this._StateAddress = `AppData.DataImport.Sessions.${this.options.WizardHash}`;
		this.options.DefaultTemplateRecordAddress = `AppData.DataImport._WizardConfig.${this.options.WizardHash}`;
		if (Array.isArray(this.options.Renderables) && this.options.Renderables[0])
		{
			this.options.Renderables[0].ContentDestinationAddress = this.options.DefaultDestinationAddress;
		}

		this._accHash = `${this.options.WizardHash}-Accordion`;
		this._uploadHash = `${this.options.WizardHash}-Upload`;
		this._accordion = null;
		this._uploadView = null;
		this._fileHandle = null;     // the live upload handle (off AppData)
		this._parsedRows = null;     // cache of parsed rows
		this._schema = null;         // resolved target schema
		this._wired = false;

		// The render record for DI-Root just needs WizardHash.
		this.pict.AppData.DataImport = this.pict.AppData.DataImport || {};
		this.pict.AppData.DataImport._WizardConfig = this.pict.AppData.DataImport._WizardConfig || {};
		this.pict.AppData.DataImport._WizardConfig[this.options.WizardHash] = { WizardHash: this.options.WizardHash };

		this._ensureProviders();
		this._session();   // seed the session
	}

	/** Register the sibling providers if the host hasn't already. */
	_ensureProviders()
	{
		if (!this.pict.providers['Pict-Section-Accordion'])
		{
			this.pict.addProvider('Pict-Section-Accordion', libPictSectionAccordion.default_configuration, libPictSectionAccordion);
		}
		if (!this.pict.providers['Pict-Section-Upload'])
		{
			this.pict.addProvider('Pict-Section-Upload', libPictSectionUpload.default_configuration, libPictSectionUpload);
		}
	}

	/** @return {Record<string, any>} The session state slot (created on first access). */
	_session()
	{
		this.pict.AppData.DataImport = this.pict.AppData.DataImport || {};
		this.pict.AppData.DataImport.Sessions = this.pict.AppData.DataImport.Sessions || {};
		if (!this.pict.AppData.DataImport.Sessions[this.options.WizardHash])
		{
			const tmpSession = libSession.newImportSession(this.options.WizardHash, { Title: this.options.Title, SchemaSource: this.options.SchemaSource, PushMode: this.options.PushMode });
			if (this.options.DefaultMapping) { tmpSession.Mapping = JSON.parse(JSON.stringify(this.options.DefaultMapping)); tmpSession.Mapping.TargetSchemaSource = this.options.SchemaSource; }
			this.pict.AppData.DataImport.Sessions[this.options.WizardHash] = tmpSession;
		}
		return this.pict.AppData.DataImport.Sessions[this.options.WizardHash];
	}

	onAfterRender(pRenderable)
	{
		if (this.pict.CSSMap && typeof this.pict.CSSMap.injectCSS === 'function') { this.pict.CSSMap.injectCSS(); }
		// Build the accordion + step bodies on first render, and REBUILD whenever a host re-render has wiped
		// our mount. When the wizard is embedded in a routed host that repaints its container (on navigation,
		// or after a push), the DI-Root template recreates an EMPTY `#DI_Acc_<WizardHash>` while `_wired` stays
		// true — which would otherwise leave a bare accordion shell. createAccordion / createUploader are keyed
		// by hash (reconfigure-or-create) and the accordion keeps its serializable nav state, so the rebuild
		// restores the current step + the host's step bodies without losing progress.
		if (!this._wired || !this._accordionMounted())
		{
			this._wired = true;
			this._buildWizard();
		}
		return super.onAfterRender(pRenderable);
	}

	/**
	 * Is the accordion currently rendered into its mount, or has a host re-render wiped it? The DI-Root
	 * template recreates an empty `#DI_Acc_<WizardHash>` on every paint, so an empty mount means the
	 * accordion (and its step bodies) need (re)building.
	 * @return {boolean}
	 */
	_accordionMounted()
	{
		// No DOM to inspect (server-side render) — defer to the `_wired` one-time gate.
		if (typeof document === 'undefined') { return true; }
		const tmpElement = document.getElementById(`DI_Acc_${this.options.WizardHash}`);
		return !!(tmpElement && tmpElement.children && (tmpElement.children.length > 0));
	}

	/** Create the accordion + upload view and render all step bodies; safe to re-run (idempotent rebuild). */
	_buildWizard()
	{
		const tmpAccordionProvider = this.pict.providers['Pict-Section-Accordion'];
		const tmpSteps = _STEP_DEFS.map((pStep) => Object.assign({}, pStep, { CanAdvance: () => this._canAdvance(pStep.Hash) }));
		this._accordion = tmpAccordionProvider.createAccordion(this._accHash,
			{
				DestinationAddress: `#DI_Acc_${this.options.WizardHash}`,
				RenderMode: this.options.RenderMode,
				Steps: tmpSteps,
				OnStepChange: (pTo) => this._onEnterStep(pTo && pTo.Hash),
				OnComplete: () => { /* last step (push) Next: no-op; push is an explicit button */ },
			});
		this.pict.views[this._accHash].render();

		// Render each step's body into its accordion container.
		_STEP_DEFS.forEach((pStep) => this._renderStepBody(pStep.Hash));

		// Create the upload control into the upload step body.
		this._createUploader();
	}

	/** @return {boolean} Per-step Next gate. */
	_canAdvance(pStepHash)
	{
		const tmpSession = this._session();
		switch (pStepHash)
		{
			case 'upload': return !!tmpSession.File;
			case 'detect': return Array.isArray(tmpSession.DetectedColumns) && tmpSession.DetectedColumns.length > 0;
			case 'mapping': return !!(tmpSession.Mapping && tmpSession.Mapping.Order && tmpSession.Mapping.Order.length > 0);
			case 'generate': return !!tmpSession.Comprehension;
			default: return true;
		}
	}

	/** Step-entry side effects: parse on entering detect, load schema on entering mapping. */
	_onEnterStep(pStepHash)
	{
		if (typeof this.options.OnStepChange === 'function') { try { this.options.OnStepChange(pStepHash); } catch (pError) { /* host callback */ } }
		if (pStepHash === 'detect') { this._runDetect(); }
		else if (pStepHash === 'mapping') { this._loadSchemaAndMapping(); }
		else if (pStepHash === 'generate') { this._renderStepBody('generate'); }
		else if (pStepHash === 'push') { this._renderStepBody('push'); }
	}

	_createUploader()
	{
		const tmpUploadProvider = this.pict.providers['Pict-Section-Upload'];
		const tmpAccept = this._acceptString();
		tmpUploadProvider.createUploader(this._uploadHash,
			{
				DestinationAddress: `#DI_Upload_${this.options.WizardHash}`,
				Accept: tmpAccept,
				DropLabel: 'Drop your data file here, or',
				OnComplete: (pHandle) => this._onFileReady(pHandle),
				OnRemove: () => { this._fileHandle = null; this._parsedRows = null; this._session().File = null; this._refreshAccordionChrome(); },
			});
		this._uploadView = this.pict.views[this._uploadHash];
		this._uploadView.render();
	}

	/** @return {string} The accept filter derived from AllowedFileTypes. */
	_acceptString()
	{
		const tmpMap = { csv: '.csv,text/csv', tsv: '.tsv,.tab', xlsx: '.xlsx,.xls', fixedwidth: '.txt,.dat,.fw' };
		return (this.options.AllowedFileTypes || []).map((pKind) => tmpMap[pKind] || '').filter(Boolean).join(',');
	}

	_onFileReady(pHandle)
	{
		this._fileHandle = pHandle;
		this._parsedRows = null;
		const tmpKind = this._inferKind(pHandle);
		const tmpSession = this._session();
		tmpSession.File = { Ref: `upload:${this._uploadHash}:${pHandle.Hash}`, Name: pHandle.Name, Size: pHandle.Size, Type: pHandle.Type, Kind: tmpKind, Stored: false, StorageRef: null };
		tmpSession.ParseConfig.Kind = tmpKind;
		tmpSession.StepStatus.upload = 'complete';
		if (this._accordion) { this._accordion.setStepComplete('upload', true); }
		this._persist();
	}

	/** @return {string} Infer the parser kind from the file name/type. */
	_inferKind(pHandle)
	{
		const tmpName = (pHandle.Name || '').toLowerCase();
		const tmpType = (pHandle.Type || '').toLowerCase();
		if (/\.(xlsx|xls)$/.test(tmpName) || tmpType.indexOf('spreadsheet') >= 0 || tmpType.indexOf('excel') >= 0) { return 'xlsx'; }
		if (/\.(tsv|tab)$/.test(tmpName) || tmpType.indexOf('tab-separated') >= 0) { return 'tsv'; }
		if (/\.(fw|dat)$/.test(tmpName)) { return 'fixedwidth'; }
		return 'csv';
	}

	/** @return {any} The active parser for the session's file kind. */
	_activeParser()
	{
		const tmpKind = this._session().ParseConfig.Kind || 'csv';
		const tmpParsers = this.options.ResolvedParsers || {};
		return tmpParsers[tmpKind] || tmpParsers.csv;
	}

	// --- Step 2: detect ---

	_runDetect()
	{
		const tmpParser = this._activeParser();
		const tmpSession = this._session();
		if (!this._fileHandle || !tmpParser) { this._renderStepBody('detect'); return; }
		tmpParser.detect(this._fileHandle, tmpSession.ParseConfig).then((pDetection) =>
		{
			tmpSession.DetectedColumns = pDetection.Columns || [];
			tmpSession.SampleRows = pDetection.SampleRows || [];
			tmpSession.RowCountEstimate = pDetection.RowCountEstimate || 0;
			tmpSession.RawLines = pDetection.RawLines || [];
			tmpSession.StepStatus.detect = (tmpSession.DetectedColumns.length > 0) ? 'complete' : 'active';
			this._parsedRows = null;
			this._persist();
			this._renderStepBody('detect');
			this._refreshAccordionChrome();
		}).catch((pError) => { this._reportError(pError); });
	}

	setParseKind(pKind) { this._session().ParseConfig.Kind = pKind; this._runDetect(); }
	setDelimiter(pValue) { this._session().ParseConfig.Delimited.Delimiter = (pValue === 'tab') ? '\t' : pValue; this._runDetect(); }
	setHasHeader(pChecked) { this._session().ParseConfig.Delimited.HasHeader = !!pChecked; this._runDetect(); }
	applyFixedWidthColumns()
	{
		const tmpElement = (typeof document !== 'undefined') ? document.getElementById(`DI_FW_${this.options.WizardHash}`) : null;
		if (!tmpElement) { return; }
		try { this._session().ParseConfig.FixedWidth.Columns = JSON.parse(tmpElement.value || '[]'); this._runDetect(); }
		catch (pError) { this._reportError(new Error('Fixed-width columns must be valid JSON.')); }
	}

	_detectRenderState()
	{
		const tmpSession = this._session();
		const tmpKind = tmpSession.ParseConfig.Kind || 'csv';
		const tmpKindOptions = [ 'csv', 'tsv', 'xlsx', 'fixedwidth' ].map((pK) => ({ Value: pK, Label: pK.toUpperCase(), Selected: (pK === tmpKind) }));
		const tmpHeader = (tmpSession.DetectedColumns || []).map((pColumn) => ({ SourceName: pColumn.SourceName, InferredType: pColumn.InferredType }));
		const tmpSampleRows = (tmpSession.SampleRows || []).slice(0, 12).map((pRow) =>
			({ Cells: (tmpSession.DetectedColumns || []).map((pColumn) => ({ Value: pRow[pColumn.SourceName] })) }));
		const tmpIsDelimited = (tmpKind === 'csv' || tmpKind === 'tsv');
		const tmpIsFixed = (tmpKind === 'fixedwidth');
		return {
			WizardHash: this.options.WizardHash,
			KindOptions: tmpKindOptions,
			DelimitedSlot: tmpIsDelimited ? [ {
				WizardHash: this.options.WizardHash,
				HasHeader: (tmpSession.ParseConfig.Delimited.HasHeader !== false),
				DelimiterOptions: [ { Value: ',', Label: 'Comma', Selected: tmpSession.ParseConfig.Delimited.Delimiter === ',' }, { Value: 'tab', Label: 'Tab', Selected: tmpSession.ParseConfig.Delimited.Delimiter === '\t' }, { Value: ';', Label: 'Semicolon', Selected: tmpSession.ParseConfig.Delimited.Delimiter === ';' }, { Value: '|', Label: 'Pipe', Selected: tmpSession.ParseConfig.Delimited.Delimiter === '|' } ],
			} ] : [],
			RulerSlot: tmpIsFixed ? [ { WizardHash: this.options.WizardHash, Ruler: this._buildRuler(tmpSession.RawLines), ColumnsJSON: JSON.stringify(tmpSession.ParseConfig.FixedWidth.Columns || []) } ] : [],
			ColumnCount: (tmpSession.DetectedColumns || []).length,
			RowCountEstimate: tmpSession.RowCountEstimate || 0,
			SampleHeader: tmpHeader,
			SampleRows: tmpSampleRows,
		};
	}

	_buildRuler(pLines)
	{
		const tmpLines = Array.isArray(pLines) ? pLines.slice(0, 8) : [];
		if (tmpLines.length === 0) { return ''; }
		const tmpWidth = Math.max.apply(null, tmpLines.map((pLine) => pLine.length).concat([ 0 ]));
		let tmpRuler = '';
		for (let i = 0; i < tmpWidth; i++) { tmpRuler += (i % 10 === 0) ? String((i / 10) % 10) : ((i % 5 === 0) ? '+' : '.'); }
		return tmpRuler + '\n' + tmpLines.join('\n');
	}

	// --- Step 3: mapping ---

	_loadSchemaAndMapping()
	{
		const tmpSession = this._session();
		const tmpProvider = this.options.ResolvedSchemaProvider;
		if (!tmpProvider) { this._renderStepBody('mapping'); return; }
		Promise.resolve(tmpProvider.getSchema({ URLPrefix: this.options.URLPrefix })).then((pSchema) =>
		{
			this._schema = pSchema || { Entities: [], Order: [] };
			if (typeof this.options.OnSchemaLoaded === 'function') { try { this.options.OnSchemaLoaded(this._schema); } catch (pError) { /* host */ } }
			// Seed the mapping from the schema if the host gave no default mapping yet.
			if (!tmpSession.Mapping.Order || tmpSession.Mapping.Order.length === 0) { tmpSession.Mapping = this._autoBuildMapping(this._schema); }
			this._seedStrategyUI();
			this._applyGUIDStrategy();
			this._persist();
			this._renderStepBody('mapping');
			this._refreshAccordionChrome();
		}).catch((pError) => { this._reportError(pError); });
	}

	/** Is the context-aware GUID strategy panel + composition enabled for this wizard? */
	_strategyActive()
	{
		return !!this.options.GUIDStrategy;
	}

	/** Seed the editable per-entity GUID strategy UI model (host default, else prefixed + first column). */
	_seedStrategyUI()
	{
		if (!this._strategyActive()) { return; }
		const tmpSession = this._session();
		tmpSession.GUIDStrategyUI = tmpSession.GUIDStrategyUI || {};
		const tmpDefaults = this.options.GUIDStrategyDefault || {};
		const tmpFirstColumn = ((tmpSession.DetectedColumns || [])[0] || {}).SourceName || '';
		(tmpSession.Mapping.Order || []).forEach((pEntityName) =>
		{
			if (!tmpSession.GUIDStrategyUI[pEntityName])
			{
				tmpSession.GUIDStrategyUI[pEntityName] = tmpDefaults[pEntityName]
					? JSON.parse(JSON.stringify(tmpDefaults[pEntityName]))
					: { Mode: 'prefixed', OwnKeyColumn: tmpFirstColumn, OwnKeyColumns: tmpFirstColumn ? [ tmpFirstColumn ] : [], OwnKeyMode: 'columns', OwnKeyTemplate: '', Parents: [] };
			}
		});
	}

	/**
	 * Compile the editable GUID strategy UI model (meadow-integration) against the schema's GUID column
	 * sizes + attach it to each entity mapping. The transform then composes stable, length-safe GUIDs +
	 * foreign-key fields instead of the flat GUIDTemplate.
	 */
	_applyGUIDStrategy()
	{
		if (!this._strategyActive()) { return; }
		const tmpSession = this._session();
		const tmpConfig = libStrategyApply.buildStrategyConfig(tmpSession.GUIDStrategyUI || {}, this.options.GUIDStrategyPrefix || 'UI');
		const tmpResult = libStrategyApply.applyStrategy(tmpSession.Mapping, tmpConfig, this.options.ContextEntityCatalog, this._schema);
		this._strategyWarnings = tmpResult.Warnings || [];
	}

	/** Mutable per-entity UI model accessor (creates a default if absent). */
	_strategyUIEntity(pEntity)
	{
		const tmpSession = this._session();
		tmpSession.GUIDStrategyUI = tmpSession.GUIDStrategyUI || {};
		if (!tmpSession.GUIDStrategyUI[pEntity]) { tmpSession.GUIDStrategyUI[pEntity] = { Mode: 'prefixed', OwnKeyColumn: '', OwnKeyColumns: [], OwnKeyMode: 'columns', OwnKeyTemplate: '', Parents: [] }; }
		return tmpSession.GUIDStrategyUI[pEntity];
	}

	/** Recompile + re-render after any strategy panel edit. */
	_afterStrategyEdit()
	{
		this._applyGUIDStrategy();
		this._persist();
		this._renderStepBody('mapping');
	}

	setStrategyMode(pEntity, pMode) { this._strategyUIEntity(pEntity).Mode = pMode; this._afterStrategyEdit(); }

	// Combinatorial own key (#1): the entity's GUID can be keyed by ONE column, SEVERAL columns concatenated,
	// or a user-typed pict template. OwnKeyColumns is the column list; OwnKeyTemplate (template mode) wins in
	// the engine's ownValueTemplate(). OwnKeyColumn is kept in sync for backward compatibility.
	/** The own-key column list (migrating a legacy single OwnKeyColumn on first access). */
	_ownColumns(pEntity)
	{
		const tmpEntity = this._strategyUIEntity(pEntity);
		if (!Array.isArray(tmpEntity.OwnKeyColumns))
		{
			tmpEntity.OwnKeyColumns = tmpEntity.OwnKeyColumn ? [ tmpEntity.OwnKeyColumn ] : [];
		}
		return tmpEntity.OwnKeyColumns;
	}
	_syncOwnSingle(pEntity) { const tmpEntity = this._strategyUIEntity(pEntity); tmpEntity.OwnKeyColumn = this._ownColumns(pEntity)[0] || ''; }
	setStrategyOwnKey(pEntity, pColumn) { const tmpEntity = this._strategyUIEntity(pEntity); tmpEntity.OwnKeyColumns = pColumn ? [ pColumn ] : []; tmpEntity.OwnKeyColumn = pColumn; this._afterStrategyEdit(); }
	setStrategyOwnKeyAt(pEntity, pIndex, pColumn)
	{
		const tmpColumns = this._ownColumns(pEntity);
		if (pColumn) { tmpColumns[Number(pIndex)] = pColumn; } else { tmpColumns.splice(Number(pIndex), 1); }
		this._syncOwnSingle(pEntity); this._afterStrategyEdit();
	}
	addStrategyOwnKey(pEntity, pColumn) { this._ownColumns(pEntity).push(pColumn); this._syncOwnSingle(pEntity); this._afterStrategyEdit(); }
	removeStrategyOwnKey(pEntity, pIndex) { this._ownColumns(pEntity).splice(Number(pIndex), 1); this._syncOwnSingle(pEntity); this._afterStrategyEdit(); }
	setStrategyOwnKeyTemplate(pEntity, pTemplate) { this._strategyUIEntity(pEntity).OwnKeyTemplate = pTemplate; this._afterStrategyEdit(); }
	toggleStrategyOwnMode(pEntity)
	{
		const tmpEntity = this._strategyUIEntity(pEntity);
		if (tmpEntity.OwnKeyMode === 'template')
		{
			tmpEntity.OwnKeyMode = 'columns';
			tmpEntity.OwnKeyTemplate = '';   // columns win once template is cleared
		}
		else
		{
			tmpEntity.OwnKeyMode = 'template';
			if (!tmpEntity.OwnKeyTemplate)
			{
				tmpEntity.OwnKeyTemplate = this._ownColumns(pEntity).map((pColumn) => `{~D:Record.${pColumn}~}`).join('');
			}
		}
		this._afterStrategyEdit();
	}
	addStrategyParent(pEntity, pParentEntity)
	{
		const tmpEntity = this._strategyUIEntity(pEntity);
		tmpEntity.Parents = tmpEntity.Parents || [];
		tmpEntity.Parents.push({ Entity: pParentEntity, KeyColumn: '', Mode: 'prefixed', CrossSession: true });
		this._afterStrategyEdit();
	}
	removeStrategyParent(pEntity, pIndex) { const tmpEntity = this._strategyUIEntity(pEntity); if (tmpEntity.Parents) { tmpEntity.Parents.splice(Number(pIndex), 1); } this._afterStrategyEdit(); }
	setParentEntity(pEntity, pIndex, pParentEntity) { const tmpParent = (this._strategyUIEntity(pEntity).Parents || [])[Number(pIndex)]; if (tmpParent) { tmpParent.Entity = pParentEntity; } this._afterStrategyEdit(); }
	setParentKey(pEntity, pIndex, pColumn) { const tmpParent = (this._strategyUIEntity(pEntity).Parents || [])[Number(pIndex)]; if (tmpParent) { tmpParent.KeyColumn = pColumn; } this._afterStrategyEdit(); }
	setParentMode(pEntity, pIndex, pMode) { const tmpParent = (this._strategyUIEntity(pEntity).Parents || [])[Number(pIndex)]; if (tmpParent) { tmpParent.Mode = pMode; } this._afterStrategyEdit(); }

	/** Build the strategy-panel render data for one entity (mode + own-key + parents + live preview). */
	_strategyEntityState(pEntityName, pSourceNames)
	{
		const tmpSession = this._session();
		const tmpUI = (tmpSession.GUIDStrategyUI || {})[pEntityName] || { Mode: 'prefixed', OwnKeyColumn: '', Parents: [] };
		const tmpCatalog = this.options.ContextEntityCatalog || {};
		const tmpCatalogEntities = Object.keys(tmpCatalog);
		const tmpModeOptions = (pSelected) => [ { Value: 'prefixed', Label: 'Prefixed (auto)', Selected: pSelected === 'prefixed' }, { Value: 'raw', Label: 'Raw GUID', Selected: pSelected === 'raw' }, { Value: 'rawid', Label: 'Raw ID', Selected: pSelected === 'rawid' } ];
		const tmpColumnOptions = (pSelected) => [ { Value: '', Label: '(column)', Selected: !pSelected } ].concat(pSourceNames.map((pName) => ({ Value: pName, Label: pName, Selected: pName === pSelected })));

		// Own-key slot: only prefixed mode composes its own GUID. It can be one column, several columns
		// (concatenated), or a typed template — see #1 combinatorial GUID.
		let tmpOwnKeySlot = [];
		if ((tmpUI.Mode || 'prefixed') === 'prefixed')
		{
			const tmpIsTemplate = (tmpUI.OwnKeyMode === 'template');
			const tmpOwnCols = Array.isArray(tmpUI.OwnKeyColumns) ? tmpUI.OwnKeyColumns : (tmpUI.OwnKeyColumn ? [ tmpUI.OwnKeyColumn ] : []);
			const tmpColumnItems = tmpIsTemplate ? [] : tmpOwnCols.map((pColumn, pIndex) => (
				{
					WizardHash: this.options.WizardHash, Entity: pEntityName, Index: pIndex,
					Options: tmpColumnOptions(pColumn),
					RemoveSlot: (tmpOwnCols.length > 1) ? [ { WizardHash: this.options.WizardHash, Entity: pEntityName, Index: pIndex } ] : [],
				}));
			const tmpUsedOwn = {};
			tmpOwnCols.forEach((pColumn) => { if (pColumn) { tmpUsedOwn[pColumn] = true; } });
			const tmpAddOwnOptions = [ { Value: '', Label: '+ column', Selected: true } ].concat(pSourceNames.filter((pName) => !tmpUsedOwn[pName]).map((pName) => ({ Value: pName, Label: pName, Selected: false })));
			const tmpAddColumnSlot = (!tmpIsTemplate && (tmpAddOwnOptions.length > 1)) ? [ { WizardHash: this.options.WizardHash, Entity: pEntityName, Options: tmpAddOwnOptions } ] : [];
			const tmpTemplateSlot = tmpIsTemplate ? [ { WizardHash: this.options.WizardHash, Entity: pEntityName, Template: tmpUI.OwnKeyTemplate || '', Placeholder: 'e.g. {~D:Record.District~}-{~D:Record.Code~}' } ] : [];
			tmpOwnKeySlot = [ { WizardHash: this.options.WizardHash, Entity: pEntityName, ColumnItems: tmpColumnItems, AddColumnSlot: tmpAddColumnSlot, TemplateSlot: tmpTemplateSlot, ToggleLabel: tmpIsTemplate ? 'use columns' : 'ƒ template' } ];
		}

		const tmpParents = (tmpUI.Parents || []).map((pParent, pIndex) => (
			{
				WizardHash: this.options.WizardHash, Entity: pEntityName, Index: pIndex,
				EntityOptions: [ { Value: '', Label: '(entity)', Selected: !pParent.Entity } ].concat(tmpCatalogEntities.map((pName) => ({ Value: pName, Label: pName, Selected: pName === pParent.Entity }))),
				KeyOptions: tmpColumnOptions(pParent.KeyColumn),
				ModeOptions: tmpModeOptions(pParent.Mode || 'prefixed'),
			}));

		const tmpUsed = {};
		(tmpUI.Parents || []).forEach((pParent) => { if (pParent.Entity) { tmpUsed[pParent.Entity] = true; } });
		const tmpAddOptions = [ { Value: '', Label: '+ Related entity', Selected: true } ].concat(tmpCatalogEntities.filter((pName) => !tmpUsed[pName] && (pName !== pEntityName)).map((pName) => ({ Value: pName, Label: pName, Selected: false })));
		const tmpAddParentSlot = (tmpAddOptions.length > 1) ? [ { WizardHash: this.options.WizardHash, Entity: pEntityName, Options: tmpAddOptions } ] : [];

		let tmpPreviewSlot = [];
		try
		{
			const tmpPreview = libStrategyApply.previewEntityGUID(tmpSession.GUIDStrategyUI || {}, this.options.GUIDStrategyPrefix || 'UI', tmpCatalog, this._schema, pEntityName, (tmpSession.SampleRows || [])[0] || {});
			if (tmpPreview) { tmpPreviewSlot = [ { Preview: tmpPreview } ]; }
		}
		catch (pError) { /* preview is best-effort */ }

		const tmpWarnings = (this._strategyWarnings || []).filter((pWarning) => pWarning.indexOf(`"${pEntityName}"`) >= 0).map((pWarning) => ({ Message: pWarning }));

		return {
			WizardHash: this.options.WizardHash, Entity: pEntityName,
			ModeOptions: tmpModeOptions(tmpUI.Mode || 'prefixed'),
			OwnKeySlot: tmpOwnKeySlot, Parents: tmpParents, AddParentSlot: tmpAddParentSlot,
			PreviewSlot: tmpPreviewSlot, Warnings: tmpWarnings,
		};
	}

	/** Auto-build a starting mapping from the schema: same-named source columns + a GUID template guess. */
	_autoBuildMapping(pSchema)
	{
		const tmpSourceNames = (this._session().DetectedColumns || []).map((pColumn) => pColumn.SourceName);
		const tmpEntities = {};
		const tmpOrder = pSchema.Order || pSchema.Entities.map((pEntity) => pEntity.Entity);
		pSchema.Entities.forEach((pEntity) =>
		{
			const tmpGUIDColumn = tmpSourceNames[0] || 'id';
			const tmpMappings = {};
			const tmpBindings = {};
			pEntity.Fields.forEach((pField) =>
			{
				if (pField.IsGUID) { return; }
				const tmpMatch = tmpSourceNames.find((pName) => pName.toLowerCase() === pField.Name.toLowerCase());
				if (tmpMatch) { tmpMappings[pField.Name] = `{~D:Record.${tmpMatch}~}`; tmpBindings[pField.Name] = tmpMatch; }
			});
			tmpEntities[pEntity.Entity] = {
				Entity: pEntity.Entity,
				GUIDName: pEntity.GUIDName,
				GUIDTemplate: pEntity.GUIDTemplateDefault || `${pEntity.Entity}_{~D:Record.${tmpGUIDColumn}~}`,
				Mappings: tmpMappings,
				_ColumnBindings: tmpBindings,
			};
		});
		return { TargetSchemaSource: this.options.SchemaSource, Order: tmpOrder, Entities: tmpEntities };
	}

	setMappingBinding(pEntity, pField, pSourceColumn)
	{
		const tmpSession = this._session();
		const tmpEntityMapping = tmpSession.Mapping.Entities[pEntity];
		if (!tmpEntityMapping) { return; }
		tmpEntityMapping._ColumnBindings = tmpEntityMapping._ColumnBindings || {};
		if (pSourceColumn) { tmpEntityMapping._ColumnBindings[pField] = pSourceColumn; tmpEntityMapping.Mappings[pField] = `{~D:Record.${pSourceColumn}~}`; }
		else { delete tmpEntityMapping._ColumnBindings[pField]; delete tmpEntityMapping.Mappings[pField]; }
		this._persist();
	}

	applyRawMapping()
	{
		const tmpElement = (typeof document !== 'undefined') ? document.getElementById(`DI_RawMap_${this.options.WizardHash}`) : null;
		if (!tmpElement) { return; }
		try { this._session().Mapping = JSON.parse(tmpElement.value); this._persist(); this._renderStepBody('mapping'); this._refreshAccordionChrome(); }
		catch (pError) { this._reportError(new Error('Mapping JSON is invalid.')); }
	}

	_mappingRenderState()
	{
		const tmpSession = this._session();
		const tmpSourceNames = (tmpSession.DetectedColumns || []).map((pColumn) => pColumn.SourceName);
		const tmpMapping = tmpSession.Mapping || { Order: [], Entities: {} };
		const tmpSchemaByEntity = {};
		if (this._schema) { (this._schema.Entities || []).forEach((pEntity) => { tmpSchemaByEntity[pEntity.Entity] = pEntity; }); }

		const tmpEntities = (tmpMapping.Order || []).map((pEntityName) =>
		{
			const tmpEntityMapping = tmpMapping.Entities[pEntityName] || { Entity: pEntityName, Mappings: {}, _ColumnBindings: {} };
			const tmpSchemaEntity = tmpSchemaByEntity[pEntityName];
			// Field rows: prefer the schema's fields; else the mapping's own field keys.
			const tmpFieldNames = tmpSchemaEntity
				? tmpSchemaEntity.Fields.filter((pField) => !pField.IsGUID).map((pField) => pField.Name)
				: Object.keys(tmpEntityMapping.Mappings || {});
			const tmpBindings = tmpEntityMapping._ColumnBindings || {};
			const tmpFields = tmpFieldNames.map((pFieldName) =>
			{
				const tmpBound = tmpBindings[pFieldName] || '';
				const tmpOptions = [ { Value: '', Label: '(none)', Selected: !tmpBound } ].concat(tmpSourceNames.map((pName) => ({ Value: pName, Label: pName, Selected: pName === tmpBound })));
				const tmpRequired = tmpSchemaEntity ? !!(tmpSchemaEntity.Fields.find((pField) => pField.Name === pFieldName) || {}).Required : false;
				return { WizardHash: this.options.WizardHash, Entity: pEntityName, Name: pFieldName, Required: tmpRequired, Options: tmpOptions };
			});
			return {
				Entity: pEntityName, GUIDTemplate: tmpEntityMapping.GUIDTemplate || '', Fields: tmpFields,
				LegacyGUIDSlot: this._strategyActive() ? [] : [ { GUIDTemplate: tmpEntityMapping.GUIDTemplate || '' } ],
				StrategySlot: this._strategyActive() ? [ this._strategyEntityState(pEntityName, tmpSourceNames) ] : [],
			};
		});

		return { WizardHash: this.options.WizardHash, Entities: tmpEntities, RawJSON: JSON.stringify(tmpMapping, null, 2) };
	}

	// --- Step 4: generate ---

	_ensureParsedRows()
	{
		if (this._parsedRows) { return Promise.resolve(this._parsedRows); }
		const tmpParser = this._activeParser();
		if (!this._fileHandle || !tmpParser) { return Promise.resolve([]); }
		return Promise.resolve(tmpParser.parse(this._fileHandle, this._session().ParseConfig)).then((pRows) => { this._parsedRows = pRows || []; return this._parsedRows; });
	}

	generate()
	{
		const tmpSession = this._session();
		const tmpBuilder = this.options.ComprehensionBuilder;
		if (!tmpBuilder) { this._reportError(new Error('No comprehension builder available.')); return; }
		this._ensureParsedRows().then((pRows) =>
		{
			const tmpResult = tmpBuilder.build(tmpSession.Mapping, pRows);
			tmpSession.Comprehension = tmpResult.Comprehension;
			tmpSession.GenerationReport = tmpResult.Report;
			tmpSession.StepStatus.generate = 'complete';
			this._mappingWarnings = tmpBuilder.validateForeignKeyOrder(tmpSession.Mapping);
			if (typeof this.options.OnComprehension === 'function') { try { this.options.OnComprehension(tmpSession.Comprehension, tmpResult.Report); } catch (pError) { /* host */ } }
			this._persist();
			this._renderStepBody('generate');
			this._refreshAccordionChrome();
		}).catch((pError) => { this._reportError(pError); });
	}

	_generateRenderState()
	{
		const tmpSession = this._session();
		const tmpReport = tmpSession.GenerationReport;
		const tmpWarnings = this._mappingWarnings || [];
		const tmpState = {
			WizardHash: this.options.WizardHash,
			Warnings: tmpWarnings.map((pWarning) => ({ Message: pWarning.Message })),
			DownloadSlot: (this.options.AllowDownload && tmpSession.Comprehension) ? [ { WizardHash: this.options.WizardHash } ] : [],
			ReportSlot: [],
		};
		if (tmpReport && tmpSession.Comprehension)
		{
			const tmpEntityCounts = Object.keys(tmpReport.EntityCounts || {}).map((pEntity) => ({ Entity: pEntity, Count: tmpReport.EntityCounts[pEntity] }));
			const tmpEntityTotal = tmpEntityCounts.reduce((pSum, pEntry) => pSum + pEntry.Count, 0);
			// Preview the first generated entity (first few records).
			const tmpFirstEntity = Object.keys(tmpSession.Comprehension)[0];
			let tmpPreviewSlot = [];
			if (tmpFirstEntity)
			{
				const tmpRecords = Object.keys(tmpSession.Comprehension[tmpFirstEntity]).slice(0, 8).map((pKey) => tmpSession.Comprehension[tmpFirstEntity][pKey]);
				const tmpHeaderNames = tmpRecords.length > 0 ? Object.keys(tmpRecords[0]) : [];
				tmpPreviewSlot = [ {
					Entity: tmpFirstEntity, ShownCount: tmpRecords.length,
					Header: tmpHeaderNames.map((pName) => ({ Name: pName })),
					Rows: tmpRecords.map((pRecord) => ({ Cells: tmpHeaderNames.map((pName) => ({ Value: String(pRecord[pName] === undefined ? '' : pRecord[pName]) })) })),
				} ];
			}
			tmpState.ReportSlot = [ { ParsedRowCount: tmpReport.ParsedRowCount, EntityTotal: tmpEntityTotal, EntityCounts: tmpEntityCounts, PreviewSlot: tmpPreviewSlot } ];
		}
		return tmpState;
	}

	downloadComprehension()
	{
		const tmpSession = this._session();
		if (!tmpSession.Comprehension || typeof document === 'undefined') { return; }
		const tmpBlob = new Blob([ JSON.stringify(tmpSession.Comprehension, null, 2) ], { type: 'application/json' });
		const tmpURL = URL.createObjectURL(tmpBlob);
		const tmpAnchor = document.createElement('a');
		tmpAnchor.href = tmpURL;
		tmpAnchor.download = `${this.options.WizardHash}-comprehension.json`;
		tmpAnchor.click();
		URL.revokeObjectURL(tmpURL);
	}

	// --- Step 5: push ---

	push()
	{
		const tmpSession = this._session();
		const tmpTarget = this.options.ResolvedPushTarget;
		if (!tmpTarget || !tmpSession.Comprehension) { this._reportError(new Error('Nothing to push — generate a comprehension first.')); return; }
		tmpSession.Push.Status = 'running';
		tmpSession.Push.Error = null;
		this._renderStepBody('push');
		const tmpContext = {
			Order: tmpSession.Mapping.Order,
			GUIDPrefix: this.options.GUIDPrefix,
			EntityGUIDPrefix: this.options.EntityGUIDPrefix,
			ServerURL: this.options.ServerURL,
			URLPrefix: this.options.URLPrefix,
			ComprehensionPushURL: this.options.ComprehensionPushURL,
			AllowGUIDTruncation: this.options.AllowGUIDTruncation,
			// When the GUID strategy owns length, the composer has already sized every GUID to its real
			// column width. Hand the push target those widths so a marshaling adapter doesn't re-truncate a
			// composed (already-fitting) GUID down to a smaller default — which would clip the entity's own
			// distinguishing segment and collide. Only sent for the strategy path (no behavior change otherwise).
			GUIDColumnSizes: (this.options.GUIDStrategy && this._schema) ? libStrategyApply.schemaSizes(this._schema) : undefined,
			onProgress: (pPushed, pTotal) => { tmpSession.Push.Progress = { Pushed: pPushed, Total: pTotal }; this._renderStepBody('push'); },
		};
		Promise.resolve(tmpTarget.push(tmpSession.Comprehension, tmpContext)).then((pResult) =>
		{
			tmpSession.Push.Status = 'complete';
			tmpSession.Push.Result = pResult;
			tmpSession.StepStatus.push = 'complete';
			if (typeof this.options.OnPushComplete === 'function') { try { this.options.OnPushComplete(pResult); } catch (pError) { /* host */ } }
			this._persist();
			this._renderStepBody('push');
			this._refreshAccordionChrome();
		}).catch((pError) =>
		{
			tmpSession.Push.Status = 'error';
			tmpSession.Push.Error = pError.message || String(pError);
			this._renderStepBody('push');
			this._reportError(pError);
		});
	}

	_pushRenderState()
	{
		const tmpSession = this._session();
		const tmpPush = tmpSession.Push;
		const tmpRunning = (tmpPush.Status === 'running');
		const tmpPct = (tmpPush.Progress && tmpPush.Progress.Total > 0) ? Math.round((tmpPush.Progress.Pushed / tmpPush.Progress.Total) * 100) : (tmpPush.Status === 'complete' ? 100 : 0);
		return {
			WizardHash: this.options.WizardHash,
			Mode: tmpPush.Mode,
			PushLabel: tmpRunning ? 'Pushing…' : 'Push to server',
			PushDisabled: tmpRunning || !tmpSession.Comprehension,
			ProgressSlot: (tmpRunning || tmpPush.Status === 'complete') ? [ { Pct: tmpPct } ] : [],
			ResultSlot: (tmpPush.Status === 'complete' && tmpPush.Result) ? [ { Message: tmpPush.Result.Message || 'Pushed.' } ] : [],
			ErrorSlot: (tmpPush.Status === 'error' && tmpPush.Error) ? [ { Message: tmpPush.Error } ] : [],
		};
	}

	// --- Shared ---

	_renderStepBody(pStepHash)
	{
		const tmpDestination = `#PSA_Body_${this._accHash}_${pStepHash}`;
		let tmpHTML = '';
		if (pStepHash === 'upload') { tmpHTML = this.pict.parseTemplateByHash('DI-Body-Upload', { WizardHash: this.options.WizardHash }); }
		else if (pStepHash === 'detect') { tmpHTML = this.pict.parseTemplateByHash('DI-Body-Detect', this._detectRenderState()); }
		else if (pStepHash === 'mapping') { tmpHTML = this.pict.parseTemplateByHash('DI-Body-Mapping', this._mappingRenderState()); }
		else if (pStepHash === 'generate') { tmpHTML = this.pict.parseTemplateByHash('DI-Body-Generate', this._generateRenderState()); }
		else if (pStepHash === 'push') { tmpHTML = this.pict.parseTemplateByHash('DI-Body-Push', this._pushRenderState()); }
		this.pict.ContentAssignment.assignContent(tmpDestination, tmpHTML);
	}

	/** Reflect step completion on the accordion chrome (so Next-gates + medallions update). */
	_refreshAccordionChrome()
	{
		if (!this._accordion) { return; }
		const tmpSession = this._session();
		[ 'upload', 'detect', 'mapping', 'generate' ].forEach((pStep) =>
		{
			if (this._canAdvance(pStep)) { this._accordion.setStepComplete(pStep, true); }
		});
	}

	/** Persist the session via the configured StateStore (best-effort). */
	_persist()
	{
		const tmpStore = this.options.ResolvedStateStore;
		if (!tmpStore) { return; }
		try { Promise.resolve(tmpStore.save(this.options.WizardHash, libSession.serialize(this._session()))).catch(() => {}); }
		catch (pError) { /* non-fatal */ }
	}

	_reportError(pError)
	{
		this.pict.log.warn(`pict-section-dataimport [${this.options.WizardHash}] ${pError.message || pError}`);
		if (typeof this.options.OnError === 'function') { try { this.options.OnError(pError); } catch (pInner) { /* host */ } }
	}

	/** @return {Record<string, any>} The current session (for host inspection). */
	getSession() { return this._session(); }
}

module.exports = PictViewDataImportWizard;

module.exports.default_configuration = _DEFAULT_CONFIGURATION;
