/*
	Core (headless) tests for pict-section-dataimport: the ComprehensionBuilder against the REAL
	meadow-integration engine + the real bookstore mappings, the parsers, the seams, FK-order
	validation, session (de)serialization, and the dependency boundary (no server-only code pulled).
*/

const libBrowserEnv = require('browser-env');
libBrowserEnv();

const Chai = require('chai');
const Expect = Chai.expect;

const libPict = require('pict');

const libComprehensionBuilder = require('../source/services/DataImport-ComprehensionBuilder.js');
const libParserDelimited = require('../source/seams/DataImport-Parser-Delimited.js');
const libParserFixedWidth = require('../source/seams/DataImport-Parser-FixedWidth.js');
const libSchemaProvider = require('../source/seams/DataImport-SchemaProvider.js');
const libPushTarget = require('../source/seams/DataImport-PushTarget.js');
const libStateStore = require('../source/seams/DataImport-StateStore.js');
const libSession = require('../source/services/DataImport-Session.js');

const Fixtures = require('./fixtures/bookstore.js');

const newPict = () => new libPict({ LogStreams: [ { loggertype: 'console', streamtype: 'console', level: 'error' } ] });

/** A minimal in-browser file handle (text source) — mirrors the pict-section-upload handle's getText. */
const textHandle = (pText) => ({ Name: 'data.csv', Size: pText.length, Type: 'text/csv', getText: (fCallback) => fCallback(null, pText) });

suite
(
	'pict-section-dataimport — core',
	() =>
	{
		suite
		(
			'ComprehensionBuilder (real engine + real bookstore mappings)',
			() =>
			{
				test
				(
					'reproduces the canonical Book/Author/Join comprehension with fan-out + FK templating',
					(fDone) =>
					{
						const tmpBuilder = new libComprehensionBuilder(newPict());
						const tmpResult = tmpBuilder.build(Fixtures.Mapping, Fixtures.Rows);
						const tmpComprehension = tmpResult.Comprehension;

						// Entity emission order is referenced-before-referrer (load-bearing for FK resolution).
						Expect(Object.keys(tmpComprehension)).to.deep.equal([ 'Book', 'Author', 'BookAuthorJoin' ]);

						// Book: one record per row, keyed by the GUID template.
						Expect(Object.keys(tmpComprehension.Book)).to.have.lengthOf(3);
						Expect(tmpComprehension.Book['Book_1'].Title).to.equal('The Hunger Games');
						Expect(tmpComprehension.Book['Book_1'].Genre).to.equal('Unknown');
						Expect(tmpComprehension.Book['Book_1'].Type).to.equal('Book');
						Expect(tmpComprehension.Book['Book_1'].GUIDBook).to.equal('Book_1');

						// Author: the delimited "authors" column fans out into one record per author.
						const tmpAuthorNames = Object.keys(tmpComprehension.Author).map((pKey) => tmpComprehension.Author[pKey].Name);
						Expect(Object.keys(tmpComprehension.Author)).to.have.lengthOf(4, 'four unique authors across the three rows');
						Expect(tmpAuthorNames).to.include('Suzanne Collins');
						// STRINGGETSEGMENTS splits on "," WITHOUT trimming (faithful to the meadow-integration CLI),
						// so the 2nd author of "J.K. Rowling, Mary GrandPré" keeps its leading space in Name.
						Expect(tmpAuthorNames.some((pName) => /Rowling/.test(pName))).to.equal(true);
						Expect(tmpAuthorNames.some((pName) => /GrandPré/.test(pName))).to.equal(true);

						// BookAuthorJoin: one join per (book, author) pair = 1 + 2 + 1 = 4, with FK GUIDs.
						Expect(Object.keys(tmpComprehension.BookAuthorJoin)).to.have.lengthOf(4);
						const tmpJoins = Object.keys(tmpComprehension.BookAuthorJoin).map((pKey) => tmpComprehension.BookAuthorJoin[pKey]);
						const tmpRowlingJoin = tmpJoins.find((pJoin) => pJoin.GUIDBook === 'Book_2' && /Rowling/.test(pJoin.GUIDAuthor));
						Expect(tmpRowlingJoin, 'a join linking Book_2 to the Rowling author').to.be.an('object');
						Expect(tmpRowlingJoin.GUIDAuthor).to.match(/^Author_/);

						// The report counts what was produced.
						Expect(tmpResult.Report.ParsedRowCount).to.equal(3);
						Expect(tmpResult.Report.EntityCounts.Book).to.equal(3);
						Expect(tmpResult.Report.EntityCounts.BookAuthorJoin).to.equal(4);
						return fDone();
					}
				);
				test
				(
					'flags a row with no GUID as a bad record',
					(fDone) =>
					{
						const tmpBuilder = new libComprehensionBuilder(newPict());
						const tmpMapping = { Order: [ 'Thing' ], Entities: { Thing: { Entity: 'Thing', GUIDTemplate: '{~D:Record.key~}', Mappings: { Name: '{~D:Record.name~}' } } } };
						const tmpResult = tmpBuilder.build(tmpMapping, [ { key: 'k1', name: 'A' }, { key: '', name: 'B' } ]);
						Expect(Object.keys(tmpResult.Comprehension.Thing)).to.have.lengthOf(1);
						Expect(tmpResult.Report.BadRecords.length).to.be.greaterThan(0);
						return fDone();
					}
				);
			}
		);

		suite
		(
			'validateForeignKeyOrder',
			() =>
			{
				test
				(
					'flags an FK referencing an entity generated later',
					(fDone) =>
					{
						const tmpBuilder = new libComprehensionBuilder(newPict());
						const tmpBadOrder = {
							Order: [ 'BookAuthorJoin', 'Book' ],
							Entities:
							{
								BookAuthorJoin: { Entity: 'BookAuthorJoin', GUIDTemplate: 'x', Mappings: { GUIDBook: 'Book_{~D:Record.id~}' } },
								Book: { Entity: 'Book', GUIDTemplate: 'Book_{~D:Record.id~}', Mappings: { Title: '{~D:Record.t~}' } },
							},
						};
						const tmpWarnings = tmpBuilder.validateForeignKeyOrder(tmpBadOrder);
						Expect(tmpWarnings).to.have.lengthOf(1);
						Expect(tmpWarnings[0].ReferencedEntity).to.equal('Book');
						// The faithful (correct) order produces no warnings.
						Expect(tmpBuilder.validateForeignKeyOrder(Fixtures.Mapping)).to.have.lengthOf(0);
						return fDone();
					}
				);
			}
		);

		suite
		(
			'Delimited parser',
			() =>
			{
				test
				(
					'detects columns + samples from the bookstore CSV (quoted fields, embedded comma)',
					(fDone) =>
					{
						const tmpParser = new libParserDelimited(newPict(), { Kind: 'csv' });
						tmpParser.detect(textHandle(Fixtures.CSV), { Delimited: { Delimiter: ',', HasHeader: true } }).then((pDetection) =>
						{
							Expect(pDetection.Columns.map((pColumn) => pColumn.SourceName)).to.deep.equal([ 'id', 'title', 'language_code', 'isbn', 'image_url', 'authors' ]);
							Expect(pDetection.RowCountEstimate).to.equal(3);
							// The quoted authors field with an embedded comma stays one cell.
							Expect(pDetection.SampleRows[1].authors).to.equal('J.K. Rowling, Mary GrandPré');
							return fDone();
						}).catch(fDone);
					}
				);
				test
				(
					'parses the full CSV into row objects',
					(fDone) =>
					{
						const tmpParser = new libParserDelimited(newPict(), { Kind: 'csv' });
						tmpParser.parse(textHandle(Fixtures.CSV), { Delimited: { Delimiter: ',', HasHeader: true } }).then((pRows) =>
						{
							Expect(pRows).to.have.lengthOf(3);
							Expect(pRows[0].title).to.equal('The Hunger Games');
							Expect(pRows[2].language_code).to.equal('en-US');
							return fDone();
						}).catch(fDone);
					}
				);
				test
				(
					'parses TSV with a tab delimiter',
					(fDone) =>
					{
						const tmpParser = new libParserDelimited(newPict(), { Kind: 'tsv' });
						tmpParser.parse(textHandle('a\tb\n1\t2\n3\t4\n'), { Delimited: { HasHeader: true } }).then((pRows) =>
						{
							Expect(pRows).to.deep.equal([ { a: '1', b: '2' }, { a: '3', b: '4' } ]);
							return fDone();
						}).catch(fDone);
					}
				);
			}
		);

		suite
		(
			'Fixed-width parser',
			() =>
			{
				test
				(
					'returns raw lines for the ruler when no column spec is set',
					(fDone) =>
					{
						const tmpParser = new libParserFixedWidth(newPict(), {});
						tmpParser.detect(textHandle('AAABBBB\nCCCDDDD\n'), { FixedWidth: { Columns: [] } }).then((pDetection) =>
						{
							Expect(pDetection.Columns).to.have.lengthOf(0);
							Expect(pDetection.RawLines).to.deep.equal([ 'AAABBBB', 'CCCDDDD' ]);
							return fDone();
						}).catch(fDone);
					}
				);
				test
				(
					'slices fields by column boundaries',
					(fDone) =>
					{
						const tmpParser = new libParserFixedWidth(newPict(), {});
						const tmpConfig = { FixedWidth: { Columns: [ { Name: 'code', Start: 0, End: 3 }, { Name: 'name', Start: 3, End: 7 } ], HasHeader: false } };
						tmpParser.parse(textHandle('ABCwxyz\nDEFmnop\n'), tmpConfig).then((pRows) =>
						{
							Expect(pRows).to.deep.equal([ { code: 'ABC', name: 'wxyz' }, { code: 'DEF', name: 'mnop' } ]);
							return fDone();
						}).catch(fDone);
					}
				);
			}
		);

		suite
		(
			'Seams',
			() =>
			{
				test
				(
					'config SchemaProvider normalizes (default GUIDName, IsGUID, Order)',
					(fDone) =>
					{
						const tmpProvider = new libSchemaProvider.DataImportSchemaProviderConfig(newPict(),
							{ Schema: { Entities: [ { Entity: 'Invoice', Fields: [ { Name: 'Total', Type: 'number' } ] } ] } });
						tmpProvider.getSchema().then((pSchema) =>
						{
							Expect(pSchema.Entities[0].GUIDName).to.equal('GUIDInvoice');
							Expect(pSchema.Order).to.deep.equal([ 'Invoice' ]);
							return fDone();
						}).catch(fDone);
					}
				);
				test
				(
					'comprehension PushTarget POSTs the right body shape + parses the response',
					(fDone) =>
					{
						let tmpPostedURL = null;
						let tmpPostedBody = null;
						const tmpTarget = new libPushTarget.DataImportPushTargetComprehension(newPict(),
							{
								URL: '/1.0/Comprehension/Push',
								PostFunction: (pURL, pBody) => { tmpPostedURL = pURL; tmpPostedBody = pBody; return Promise.resolve({ Success: true, EntitiesPushed: [ 'Book' ], Message: 'ok' }); },
							});
						tmpTarget.push({ Book: { Book_1: {} } }, { GUIDPrefix: 'DEMO', EntityGUIDPrefix: 'B', ServerURL: 'http://h/1.0/' }).then((pResult) =>
						{
							Expect(tmpPostedURL).to.equal('/1.0/Comprehension/Push');
							Expect(tmpPostedBody.GUIDPrefix).to.equal('DEMO');
							Expect(tmpPostedBody.Comprehension.Book.Book_1).to.be.an('object');
							Expect(pResult.Success).to.equal(true);
							Expect(pResult.EntitiesPushed).to.deep.equal([ 'Book' ]);
							return fDone();
						}).catch(fDone);
					}
				);
				test
				(
					'memory StateStore round-trips a session and lists it',
					(fDone) =>
					{
						const tmpStore = new libStateStore.DataImportStateStoreMemory(newPict(), {});
						tmpStore.save('s1', { Title: 'My Import', UpdatedAt: 123, Mapping: { Order: [ 'Book' ] } })
							.then(() => tmpStore.load('s1'))
							.then((pLoaded) =>
							{
								Expect(pLoaded.Title).to.equal('My Import');
								Expect(pLoaded.Mapping.Order).to.deep.equal([ 'Book' ]);
								return tmpStore.list();
							})
							.then((pList) =>
							{
								Expect(pList).to.have.lengthOf(1);
								Expect(pList[0].SessionId).to.equal('s1');
								return fDone();
							}).catch(fDone);
					}
				);
			}
		);

		suite
		(
			'Session (de)serialization',
			() =>
			{
				test
				(
					'serialize drops the (recomputable) comprehension and round-trips through hydrate',
					(fDone) =>
					{
						const tmpSession = libSession.newImportSession('books', { Title: 'Books', SchemaSource: 'meadow', PushMode: 'entityprovider' });
						tmpSession.Comprehension = { Book: { Book_1: {} } };
						tmpSession.Mapping.Order = [ 'Book', 'Author' ];
						const tmpSnapshot = libSession.serialize(tmpSession);
						Expect(tmpSnapshot.Comprehension).to.equal(null, 'comprehension dropped by default (recomputable)');
						const tmpRound = libSession.hydrate(tmpSnapshot);
						Expect(tmpRound.SessionId).to.equal('books');
						Expect(tmpRound.Mapping.Order).to.deep.equal([ 'Book', 'Author' ]);
						Expect(tmpRound.Push.Mode).to.equal('entityprovider');
						return fDone();
					}
				);
			}
		);

		suite
		(
			'Dependency boundary',
			() =>
			{
				test
				(
					'the core (builder + parsers + seams) pulls no server-only code (orator / meadow ORM / DB drivers / xlsx)',
					(fDone) =>
					{
						// Everything required at the top of this file is already cached; assert the graph is clean.
						const tmpForbidden = Object.keys(require.cache).filter((pKey) =>
							/node_modules\/(orator|restify|xlsx|fast-xml-parser|meadow-connection|mysql|mssql|tedious|pg|mongodb)[\/]/.test(pKey)
							|| /node_modules\/meadow\//.test(pKey));
						Expect(tmpForbidden, `forbidden modules: ${tmpForbidden.join(', ')}`).to.have.lengthOf(0);
						return fDone();
					}
				);
			}
		);
	}
);
