const libPictApplication = require('pict-application');

// The module under test — required by relative path so edits to source/ land in the build.
const libPictSectionDataImport = require('../../../source/Pict-Section-DataImport.js');

// A starting mapping that mirrors meadow-integration's bookstore example: one CSV row fans out into a
// Book, N Authors (the comma-delimited "authors" column), and N BookAuthorJoin rows linking them. The
// wizard's mapping step shows the simple Book column bindings; the fan-out (Solvers + GUID templates)
// rides in the mapping and is visible/editable via the raw-JSON panel.
const _BOOKS_MAPPING =
{
	TargetSchemaSource: 'meadow',
	Order: [ 'Book', 'Author', 'BookAuthorJoin' ],
	Entities:
	{
		Book:
		{
			Entity: 'Book',
			GUIDName: 'GUIDBook',
			GUIDTemplate: 'Book_{~D:Record.id~}',
			Mappings: { Title: '{~D:Record.title~}', Language: '{~D:Record.language_code~}', ISBN: '{~D:Record.isbn~}', Genre: 'Unknown', Type: 'Book', ImageURL: '{~D:Record.image_url~}' },
			_ColumnBindings: { Title: 'title', Language: 'language_code', ISBN: 'isbn', ImageURL: 'image_url' },
		},
		Author:
		{
			Entity: 'Author',
			GUIDName: 'GUIDAuthor',
			MultipleGUIDUniqueness: true,
			Solvers: [ 'NewRecordsGUIDUniqueness = STRINGGETSEGMENTS(IncomingRecord.authors,",")' ],
			GUIDTemplate: 'Author_{~PascalCaseIdentifier:Record._GUIDUniqueness~}',
			Mappings: { Name: '{~D:Record._GUIDUniqueness~}' },
			_ColumnBindings: {},
		},
		BookAuthorJoin:
		{
			Entity: 'BookAuthorJoin',
			GUIDName: 'GUIDBookAuthorJoin',
			MultipleGUIDUniqueness: true,
			Solvers: [ 'NewRecordsGUIDUniqueness = STRINGGETSEGMENTS(IncomingRecord.authors,",")' ],
			GUIDTemplate: 'BAJ_A_{~PascalCaseIdentifier:Record._GUIDUniqueness~}_B_{~D:Record.id~}',
			Mappings: { GUIDBook: 'Book_{~D:Record.id~}', GUIDAuthor: 'Author_{~PascalCaseIdentifier:Record._GUIDUniqueness~}', IDCustomer: '1' },
			_ColumnBindings: {},
		},
	},
};

class BooksImportApplication extends libPictApplication
{
	onAfterInitializeAsync(fCallback)
	{
		this.pict.addProvider('Pict-Section-DataImport', libPictSectionDataImport.default_configuration, libPictSectionDataImport);
		const tmpDataImport = this.pict.providers['Pict-Section-DataImport'];

		tmpDataImport.createImportWizard('BooksImport',
			{
				DestinationAddress: '#BooksImport',
				RenderMode: 'wizard',
				SchemaSource: 'meadow',
				MeadowEntities: [ 'Book', 'Author', 'BookAuthorJoin' ],
				URLPrefix: '/1.0/',
				PushMode: 'entityprovider',
				// A stable prefix makes re-runs idempotent (same source row -> same Meadow GUID -> upsert in place).
				GUIDPrefix: 'BOOKSIMPORT',
				// The bookstore GUID columns are 36 chars; prefixed Author/Join GUIDs can exceed that, so
				// allow the marshaler to truncate the PREFIX (the full external GUID is preserved).
				AllowGUIDTruncation: true,
				DefaultMapping: _BOOKS_MAPPING,
				OnPushComplete: (pResult) =>
				{
					this.pict.ContentAssignment.assignContent('#Readout',
						`<div class="demo-ok">✓ ${pResult.Message}</div><div class="demo-hint">Verify with <a href="/1.0/Books/FilteredTo/FBV~GUIDBook~LK~BOOKSIMPORT%25/0/20" target="_blank">GET /1.0/Books/FilteredTo/FBV~GUIDBook~LK~BOOKSIMPORT%</a></div>`);
				},
				OnError: (pError) =>
				{
					this.pict.ContentAssignment.assignContent('#Readout', `<div class="demo-err">${pError.message || pError}</div>`);
				},
			});
		this.pict.views['BooksImport'].render();

		return super.onAfterInitializeAsync(fCallback);
	}
}

BooksImportApplication.default_configuration = { Name: 'Books Import', Hash: 'BooksImport' };

module.exports = BooksImportApplication;

module.exports.default_configuration = BooksImportApplication.default_configuration;
