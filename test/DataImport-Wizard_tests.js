/*
	Wizard wiring smoke tests: the provider creates + seeds a wizard, the full render builds the
	accordion + upload sub-views without error, seam normalization picks the right adapters, and a
	host-config schema flows through. (The deep engine behavior is covered in DataImport-Core_tests.)
*/

const libBrowserEnv = require('browser-env');
libBrowserEnv();

const Chai = require('chai');
const Expect = Chai.expect;

const libPict = require('pict');

const libPictSectionDataImport = require('../source/Pict-Section-DataImport.js');

const configureTestPict = () =>
{
	const tmpPict = new libPict({ LogStreams: [ { loggertype: 'console', streamtype: 'console', level: 'error' } ] });
	tmpPict.ContentAssignment.customAssignFunction = () => '';
	tmpPict.ContentAssignment.customReadFunction = () => '';
	tmpPict.ContentAssignment.customGetElementFunction = () => '';
	tmpPict.ContentAssignment.customAppendElementFunction = () => '';
	return tmpPict;
};

const newProvider = () =>
{
	const tmpPict = configureTestPict();
	return tmpPict.addProvider('Pict-Section-DataImport', libPictSectionDataImport.default_configuration, libPictSectionDataImport);
};

// A provider whose pict writes to the real (jsdom) DOM — used to exercise the mount / re-mount behavior
// the stubbed ContentAssignment above can't observe.
const newProviderRealDOM = () =>
{
	const tmpPict = new libPict({ LogStreams: [ { loggertype: 'console', streamtype: 'console', level: 'error' } ] });
	return tmpPict.addProvider('Pict-Section-DataImport', libPictSectionDataImport.default_configuration, libPictSectionDataImport);
};

const CONFIG_SCHEMA =
{
	Order: [ 'Customer', 'Invoice' ],
	Entities:
	[
		{ Entity: 'Customer', GUIDName: 'GUIDCustomer', GUIDTemplateDefault: 'CUST_{~D:Record.cust_id~}', Fields: [ { Name: 'Name', Type: 'string' } ] },
		{ Entity: 'Invoice', GUIDName: 'GUIDInvoice', Fields: [ { Name: 'Total', Type: 'number' }, { Name: 'GUIDCustomer', ForeignKeyEntity: 'Customer' } ] },
	],
};

suite
(
	'pict-section-dataimport — wizard wiring',
	() =>
	{
		test
		(
			'module exports the provider + wizard + seam classes',
			(fDone) =>
			{
				Expect(libPictSectionDataImport).to.be.a('function');
				Expect(libPictSectionDataImport.PictProviderDataImport).to.be.a('function');
				Expect(libPictSectionDataImport.PictViewDataImportWizard).to.be.a('function');
				Expect(libPictSectionDataImport.ParserDelimited).to.be.a('function');
				Expect(libPictSectionDataImport.PushTargetComprehension).to.be.a('function');
				Expect(libPictSectionDataImport.default_configuration.ProviderIdentifier).to.equal('Pict-Section-DataImport');
				return fDone();
			}
		);
		test
		(
			'createImportWizard creates the wizard view + seeds a session',
			(fDone) =>
			{
				const tmpProvider = newProvider();
				const tmpWizard = tmpProvider.createImportWizard('Imp1', { SchemaSource: 'config', Schema: CONFIG_SCHEMA, PushMode: 'comprehension' });
				Expect(tmpWizard).to.be.an('object');
				Expect(tmpProvider.pict.views['Imp1']).to.equal(tmpWizard);
				const tmpSession = tmpWizard.getSession();
				Expect(tmpSession.SessionId).to.equal('Imp1');
				Expect(tmpSession.CurrentStep).to.equal('upload');
				return fDone();
			}
		);
		test
		(
			'seam normalization picks the config schema + comprehension-POST adapters (no meadow engine for this path)',
			(fDone) =>
			{
				const tmpProvider = newProvider();
				const tmpWizard = tmpProvider.createImportWizard('Imp2', { SchemaSource: 'config', Schema: CONFIG_SCHEMA, PushMode: 'comprehension' });
				Expect(tmpWizard.options.ResolvedSchemaProvider).to.be.an('object');
				Expect(typeof tmpWizard.options.ResolvedSchemaProvider.getSchema).to.equal('function');
				Expect(typeof tmpWizard.options.ResolvedPushTarget.push).to.equal('function');
				Expect(tmpWizard.options.ResolvedParsers.csv).to.be.an('object');
				Expect(tmpWizard.options.ResolvedParsers.xlsx).to.be.an('object');
				return fDone();
			}
		);
		test
		(
			'full render builds the accordion + upload sub-views without error',
			(fDone) =>
			{
				const tmpProvider = newProvider();
				const tmpWizard = tmpProvider.createImportWizard('Imp3', { SchemaSource: 'config', Schema: CONFIG_SCHEMA, PushMode: 'comprehension', RenderMode: 'wizard' });
				tmpWizard.render();
				// _buildWizard ran in onAfterRender → the accordion + upload views now exist.
				Expect(tmpProvider.pict.views['Imp3-Accordion']).to.be.an('object');
				Expect(tmpProvider.pict.views['Imp3-Upload']).to.be.an('object');
				// The sibling providers were auto-registered.
				Expect(tmpProvider.pict.providers['Pict-Section-Accordion']).to.be.an('object');
				Expect(tmpProvider.pict.providers['Pict-Section-Upload']).to.be.an('object');
				return fDone();
			}
		);
		test
		(
			'a host-config schema resolves through the schema provider',
			(fDone) =>
			{
				const tmpProvider = newProvider();
				const tmpWizard = tmpProvider.createImportWizard('Imp4', { SchemaSource: 'config', Schema: CONFIG_SCHEMA });
				tmpWizard.options.ResolvedSchemaProvider.getSchema({}).then((pSchema) =>
				{
					Expect(pSchema.Order).to.deep.equal([ 'Customer', 'Invoice' ]);
					Expect(pSchema.Entities[0].GUIDName).to.equal('GUIDCustomer');
					return fDone();
				}).catch(fDone);
			}
		);
		test
		(
			'_accordionMounted() reports false for a wiped (empty) mount and true once populated',
			(fDone) =>
			{
				const tmpProvider = newProviderRealDOM();
				const tmpWizard = tmpProvider.createImportWizard('ImpMount', { SchemaSource: 'config', Schema: CONFIG_SCHEMA, PushMode: 'comprehension' });
				document.body.innerHTML = '<div id="DI_Acc_ImpMount"></div>';
				Expect(tmpWizard._accordionMounted(), 'empty mount').to.equal(false);
				document.getElementById('DI_Acc_ImpMount').innerHTML = '<div class="accordion-chrome"></div>';
				Expect(tmpWizard._accordionMounted(), 'populated mount').to.equal(true);
				return fDone();
			}
		);
		test
		(
			'a host re-render rebuilds the accordion instead of leaving an empty shell',
			(fDone) =>
			{
				const tmpProvider = newProviderRealDOM();
				document.body.innerHTML = '<div id="WizMount"></div>';
				const tmpWizard = tmpProvider.createImportWizard('ImpRemount',
					{ SchemaSource: 'config', Schema: CONFIG_SCHEMA, PushMode: 'comprehension', RenderMode: 'wizard', DestinationAddress: '#WizMount' });

				tmpWizard.render();
				const tmpMount = () => document.getElementById('DI_Acc_ImpRemount');
				Expect(tmpMount(), 'accordion mount exists on first render').to.not.equal(null);
				Expect(tmpMount().children.length, 'accordion chrome built on first render').to.be.greaterThan(0);

				// A routed host repaints its container: the wizard's DI-Root renderable (RenderMethod
				// 'replace') re-emits an EMPTY #DI_Acc — pre-fix this stayed empty (the _wired latch).
				tmpWizard.render();
				Expect(tmpMount(), 'accordion mount still present after re-render').to.not.equal(null);
				Expect(tmpMount().children.length, 'accordion rebuilt after the host re-render').to.be.greaterThan(0);
				return fDone();
			}
		);
	}
);
