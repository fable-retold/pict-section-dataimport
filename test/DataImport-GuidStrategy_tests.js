/*
	Tests for the context-aware GUID strategy wired into the import flow: applyStrategy compiles the
	meadow-integration strategy against the schema + attaches it to the mapping, then the
	ComprehensionBuilder (real transform) composes stable, length-safe GUIDs + foreign-key fields.
*/

const libBrowserEnv = require('browser-env');
libBrowserEnv();

const Chai = require('chai');
const Expect = Chai.expect;

const libPict = require('pict');

const libPictSectionDataImport = require('../source/Pict-Section-DataImport.js');
const libComprehensionBuilder = require('../source/services/DataImport-ComprehensionBuilder.js');
const libStrategyApply = require('../source/services/DataImport-GuidStrategyApply.js');

const SCHEMA =
{
	Order: [ 'LineItem' ],
	Entities:
	[
		{
			Entity: 'LineItem',
			GUIDName: 'GUIDLineItem',
			Fields:
			[
				{ Name: 'GUIDLineItem', IsGUID: true, Size: 64 },
				{ Name: 'Quantity', IsGUID: false, Size: 0 },
			],
		},
	],
};
const CATALOG = { Project: { Abbrev: 'P' }, Contract: { Abbrev: 'C' }, LineItem: { Abbrev: 'LI' } };
const STRATEGY_CONFIG =
{
	Prefix: 'UI',
	Entities:
	{
		LineItem:
		{
			Mode: 'prefixed',
			OwnKeyColumn: 'LineId',
			ContextEntities: [ 'Contract', 'Project' ],
			ContextKeyColumns: { Contract: 'ContractNum', Project: 'ProjectCode' },
			Joins: [ { ParentEntity: 'Project', Mode: 'prefixed', KeyColumn: 'ProjectCode', CrossSession: true } ],
		},
	},
};

const lineItemMapping = () => (
{
	Order: [ 'LineItem' ],
	Entities:
	{
		LineItem:
		{
			Entity: 'LineItem',
			GUIDName: 'GUIDLineItem',
			GUIDTemplate: 'LineItem_{~D:Record.LineId~}',
			Mappings: { Quantity: '{~D:Record.qty~}', _GUIDProject: 'leftover' },
		},
	},
});

suite
(
	'pict-section-dataimport — GUID strategy apply',
	() =>
	{
		test
		(
			'applyStrategy attaches a compiled strategy (schema-sized) + strips the owned fields',
			() =>
			{
				const tmpMapping = lineItemMapping();
				const tmpResult = libStrategyApply.applyStrategy(tmpMapping, STRATEGY_CONFIG, CATALOG, SCHEMA);
				const tmpEntity = tmpMapping.Entities.LineItem;
				Expect(tmpEntity.GUIDStrategy).to.be.an('object');
				Expect(tmpEntity.GUIDStrategy.Own.Compose.maxLength, 'GUID column width from the schema').to.equal(64);
				Expect(tmpEntity.Mappings, '_GUIDProject (a strategy field) stripped from data Mappings').to.not.have.property('_GUIDProject');
				Expect(tmpEntity.Mappings.Quantity, 'real data field kept').to.equal('{~D:Record.qty~}');
				Expect(tmpResult.Warnings).to.be.an('array');
			}
		);
		test
		(
			'schemaSizes reads the GUID column width per entity',
			() =>
			{
				Expect(libStrategyApply.schemaSizes(SCHEMA)).to.deep.equal({ LineItem: 64 });
			}
		);
		test
		(
			'composes context-aware GUIDs + cross-session FK through the ComprehensionBuilder',
			() =>
			{
				const tmpPict = new libPict({ Product: 'GuidStrategyApplyTest', LogStreams: [ { streamtype: 'console', level: 'error' } ] });
				const tmpBuilder = new libComprehensionBuilder(tmpPict);
				const tmpMapping = lineItemMapping();
				libStrategyApply.applyStrategy(tmpMapping, STRATEGY_CONFIG, CATALOG, SCHEMA);

				const tmpResult = tmpBuilder.build(tmpMapping, [ { ContractNum: '10', ProjectCode: '01278', LineId: '8675309', qty: '5' } ]);
				const tmpRecord = tmpResult.Comprehension.LineItem['UI_C10_P01278_LI8675309'];
				Expect(tmpRecord, 'record keyed by the composed own GUID').to.be.an('object');
				Expect(tmpRecord.GUIDLineItem).to.equal('UI_C10_P01278_LI8675309');
				Expect(tmpRecord._GUIDProject, 'cross-session FK = the project\'s own composed GUID').to.equal('UI_P01278');
				Expect(tmpRecord.Quantity).to.equal('5');
			}
		);
	}
);

suite
(
	'pict-section-dataimport — GUID strategy wizard panel',
	() =>
	{
		const PANEL_SCHEMA = { Order: [ 'LineItem' ], Entities: [ { Entity: 'LineItem', GUIDName: 'GUIDLineItem', Fields: [ { Name: 'GUIDLineItem', IsGUID: true, Size: 64 }, { Name: 'Quantity', IsGUID: false } ] } ] };

		const newPanelWizard = () =>
		{
			const tmpPict = new libPict({ Product: 'PanelTest', LogStreams: [ { streamtype: 'console', level: 'error' } ] });
			const tmpProvider = tmpPict.addProvider('Pict-Section-DataImport', libPictSectionDataImport.default_configuration, libPictSectionDataImport);
			const tmpWizard = tmpProvider.createImportWizard('PanelW', { GUIDStrategy: true, GUIDStrategyPrefix: 'UI', ContextEntityCatalog: { Project: { Abbrev: 'P' }, Contract: { Abbrev: 'C' } }, SchemaSource: 'config', Schema: PANEL_SCHEMA });
			const tmpSession = tmpWizard.getSession();
			tmpSession.DetectedColumns = [ { SourceName: 'LineId' }, { SourceName: 'ProjectCode' }, { SourceName: 'qty' } ];
			tmpSession.SampleRows = [ { LineId: '8675309', ProjectCode: '01278', qty: '5' } ];
			tmpSession.Mapping = { Order: [ 'LineItem' ], Entities: { LineItem: { Entity: 'LineItem', GUIDName: 'GUIDLineItem', GUIDTemplate: '', Mappings: { Quantity: '{~D:Record.qty~}' } } } };
			tmpWizard._schema = PANEL_SCHEMA;
			tmpWizard._seedStrategyUI();
			return tmpWizard;
		};

		test
		(
			'seeds the UI model + renders the strategy panel (legacy GUID display hidden)',
			() =>
			{
				const tmpEntity = newPanelWizard()._mappingRenderState().Entities[0];
				Expect(tmpEntity.StrategySlot, 'panel shown').to.have.length(1);
				Expect(tmpEntity.LegacyGUIDSlot, 'flat GUID display hidden').to.have.length(0);
				Expect(tmpEntity.StrategySlot[0].ModeOptions.find((pOption) => pOption.Selected).Value).to.equal('prefixed');
				Expect(tmpEntity.StrategySlot[0].OwnKeySlot[0].Options.find((pOption) => pOption.Selected).Value, 'own key seeded to the first column').to.equal('LineId');
			}
		);
		test
		(
			'adding a related entity drives the live preview + attaches a cross-session join',
			() =>
			{
				const tmpWizard = newPanelWizard();
				tmpWizard.getSession().GUIDStrategyUI.LineItem.Parents.push({ Entity: 'Project', KeyColumn: 'ProjectCode', Mode: 'prefixed', CrossSession: true });
				tmpWizard._applyGUIDStrategy();
				const tmpPanel = tmpWizard._mappingRenderState().Entities[0].StrategySlot[0];
				Expect(tmpPanel.Parents).to.have.length(1);
				Expect(tmpPanel.PreviewSlot[0].Preview, 'live preview composes the context-aware GUID').to.equal('UI_P01278_LI8675309');
				Expect(tmpWizard.getSession().Mapping.Entities.LineItem.GUIDStrategy.Joins[0].FieldName, 'cross-session FK convention').to.equal('_GUIDProject');
			}
		);
	}
);
