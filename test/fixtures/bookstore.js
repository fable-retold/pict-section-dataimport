// Faithful copies of meadow-integration's bookstore mapping files (docs/examples/bookstore/mapping_*.json),
// combined into the multi-entity mapping shape pict-section-dataimport's ComprehensionBuilder consumes,
// plus a few representative source rows. Used to prove the builder reproduces the canonical engine output.

const Mapping =
{
	Order: [ 'Book', 'Author', 'BookAuthorJoin' ],
	Entities:
	{
		Book:
		{
			Entity: 'Book',
			GUIDTemplate: 'Book_{~D:Record.id~}',
			Mappings:
			{
				Title: '{~D:Record.title~}',
				Language: '{~D:Record.language_code~}',
				ISBN: '{~D:Record.isbn~}',
				Genre: 'Unknown',
				Type: 'Book',
				ImageURL: '{~D:Record.image_url~}',
			},
		},
		Author:
		{
			Entity: 'Author',
			MultipleGUIDUniqueness: true,
			Solvers: [ 'NewRecordsGUIDUniqueness = STRINGGETSEGMENTS(IncomingRecord.authors,",")' ],
			GUIDTemplate: 'Author_{~PascalCaseIdentifier:Record._GUIDUniqueness~}',
			Mappings: { Name: '{~D:Record._GUIDUniqueness~}' },
		},
		BookAuthorJoin:
		{
			Entity: 'BookAuthorJoin',
			MultipleGUIDUniqueness: true,
			Solvers: [ 'NewRecordsGUIDUniqueness = STRINGGETSEGMENTS(IncomingRecord.authors,",")' ],
			GUIDTemplate: 'BAJ_A_{~PascalCaseIdentifier:Record._GUIDUniqueness~}_B_{~D:Record.id~}',
			Mappings:
			{
				GUIDBook: 'Book_{~D:Record.id~}',
				GUIDAuthor: 'Author_{~PascalCaseIdentifier:Record._GUIDUniqueness~}',
			},
		},
	},
};

const Rows =
[
	{ id: '1', title: 'The Hunger Games', language_code: 'eng', isbn: '439023483', image_url: 'http://img/1.jpg', authors: 'Suzanne Collins' },
	{ id: '2', title: "Harry Potter and the Sorcerer's Stone", language_code: 'eng', isbn: '439554934', image_url: 'http://img/2.jpg', authors: 'J.K. Rowling, Mary GrandPré' },
	{ id: '3', title: 'Twilight', language_code: 'en-US', isbn: '316015849', image_url: 'http://img/3.jpg', authors: 'Stephenie Meyer' },
];

// A CSV rendering of the same rows (for the delimited-parser tests).
const CSV = 'id,title,language_code,isbn,image_url,authors\n'
	+ '1,The Hunger Games,eng,439023483,http://img/1.jpg,Suzanne Collins\n'
	+ '2,"Harry Potter and the Sorcerer\'s Stone",eng,439554934,http://img/2.jpg,"J.K. Rowling, Mary GrandPré"\n'
	+ '3,Twilight,en-US,316015849,http://img/3.jpg,Stephenie Meyer\n';

module.exports = { Mapping, Rows, CSV };
