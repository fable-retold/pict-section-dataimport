const libPictApplication = require('pict-application');

// The module under test — required by relative path so edits to source/ land in the build.
const libPictSectionDataImport = require('../../../source/Pict-Section-DataImport.js');

// A complex, NON-Meadow target schema defined entirely in host config, modeled on the shape of an
// Archive.org item (see manyfest's examples/chocula/Data-Archive-org-Frankenberry.json — the General
// Mills Monster Cereals commercials, public domain). An item carries metadata + belongs to one or more
// collections, so a flat CSV of items fans out into:
//   ArchiveItem            (one per row, keyed by its archive.org identifier)
//   ArchiveCollection      (deduped, from the ";"-delimited collection column)
//   ArchiveItemCollection  (the many-to-many join, one per item x collection)
// There is no live server for this schema — the wizard GENERATES the comprehension and downloads it
// (a host with a /Comprehension/Push endpoint can POST it instead).
const _ARCHIVE_SCHEMA =
{
	Order: [ 'ArchiveItem', 'ArchiveCollection', 'ArchiveItemCollection' ],
	Entities:
	[
		{
			Entity: 'ArchiveItem', GUIDName: 'GUIDArchiveItem',
			Fields:
			[
				{ Name: 'Identifier', Required: true }, { Name: 'Title', Required: true }, { Name: 'Creator' },
				{ Name: 'MediaType' }, { Name: 'Description' }, { Name: 'LicenseURL' }, { Name: 'PublicDate' },
				{ Name: 'Runtime' }, { Name: 'FilesCount', Type: 'integer' }, { Name: 'ItemSize', Type: 'integer' },
			],
		},
		{ Entity: 'ArchiveCollection', GUIDName: 'GUIDArchiveCollection', Fields: [ { Name: 'Name', Required: true } ] },
		{
			Entity: 'ArchiveItemCollection', GUIDName: 'GUIDArchiveItemCollection',
			Fields: [ { Name: 'GUIDArchiveItem', ForeignKeyEntity: 'ArchiveItem' }, { Name: 'GUIDArchiveCollection', ForeignKeyEntity: 'ArchiveCollection' } ],
		},
	],
};

const _ARCHIVE_MAPPING =
{
	TargetSchemaSource: 'config',
	Order: [ 'ArchiveItem', 'ArchiveCollection', 'ArchiveItemCollection' ],
	Entities:
	{
		ArchiveItem:
		{
			Entity: 'ArchiveItem', GUIDName: 'GUIDArchiveItem',
			GUIDTemplate: 'ITEM_{~D:Record.identifier~}',
			Mappings:
			{
				Identifier: '{~D:Record.identifier~}', Title: '{~D:Record.title~}', Creator: '{~D:Record.creator~}',
				MediaType: '{~D:Record.mediatype~}', Description: '{~D:Record.description~}', LicenseURL: '{~D:Record.licenseurl~}',
				PublicDate: '{~D:Record.publicdate~}', Runtime: '{~D:Record.runtime~}', FilesCount: '{~D:Record.files_count~}', ItemSize: '{~D:Record.item_size~}',
			},
			_ColumnBindings: { Identifier: 'identifier', Title: 'title', Creator: 'creator', MediaType: 'mediatype', Description: 'description', LicenseURL: 'licenseurl', PublicDate: 'publicdate', Runtime: 'runtime', FilesCount: 'files_count', ItemSize: 'item_size' },
		},
		ArchiveCollection:
		{
			Entity: 'ArchiveCollection', GUIDName: 'GUIDArchiveCollection',
			MultipleGUIDUniqueness: true,
			Solvers: [ 'NewRecordsGUIDUniqueness = STRINGGETSEGMENTS(IncomingRecord.collection,";")' ],
			GUIDTemplate: 'COL_{~PascalCaseIdentifier:Record._GUIDUniqueness~}',
			Mappings: { Name: '{~D:Record._GUIDUniqueness~}' },
			_ColumnBindings: {},
		},
		ArchiveItemCollection:
		{
			Entity: 'ArchiveItemCollection', GUIDName: 'GUIDArchiveItemCollection',
			MultipleGUIDUniqueness: true,
			Solvers: [ 'NewRecordsGUIDUniqueness = STRINGGETSEGMENTS(IncomingRecord.collection,";")' ],
			GUIDTemplate: 'AIC_{~PascalCaseIdentifier:Record._GUIDUniqueness~}_{~D:Record.identifier~}',
			Mappings: { GUIDArchiveItem: 'ITEM_{~D:Record.identifier~}', GUIDArchiveCollection: 'COL_{~PascalCaseIdentifier:Record._GUIDUniqueness~}' },
			_ColumnBindings: {},
		},
	},
};

class ArchiveImportApplication extends libPictApplication
{
	onAfterInitializeAsync(fCallback)
	{
		this.pict.addProvider('Pict-Section-DataImport', libPictSectionDataImport.default_configuration, libPictSectionDataImport);
		const tmpDataImport = this.pict.providers['Pict-Section-DataImport'];

		tmpDataImport.createImportWizard('ArchiveImport',
			{
				DestinationAddress: '#ArchiveImport',
				RenderMode: 'stepper',
				SchemaSource: 'config',
				Schema: _ARCHIVE_SCHEMA,
				DefaultMapping: _ARCHIVE_MAPPING,
				// No live server for this schema — generate + Download JSON. A real host points this at its
				// own POST /Comprehension/Push endpoint (the server runs the meadow-integration engine).
				PushMode: 'comprehension',
				ComprehensionPushURL: '/1.0/Comprehension/Push',
				GUIDPrefix: 'ARCHIVEORG',
				AllowDownload: true,
				OnComprehension: (pComprehension, pReport) =>
				{
					this.pict.ContentAssignment.assignContent('#Readout',
						`<div class="demo-ok">Generated ${pReport.ParsedRowCount} items → ${Object.keys(pComprehension).length} entity types. Use “Download JSON” to inspect the Archive.org-shaped comprehension.</div>`);
				},
			});
		this.pict.views['ArchiveImport'].render();

		return super.onAfterInitializeAsync(fCallback);
	}
}

ArchiveImportApplication.default_configuration = { Name: 'Archive.org Import', Hash: 'ArchiveImport' };

module.exports = ArchiveImportApplication;

module.exports.default_configuration = ArchiveImportApplication.default_configuration;
