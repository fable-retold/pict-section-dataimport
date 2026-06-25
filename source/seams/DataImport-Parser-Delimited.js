// DataImport-Parser-Delimited — CSV + TSV parser (hand-rolled, RFC-4180-aware, no dependency).
//
// Handles quoted fields, embedded delimiters + newlines inside quotes, and doubled "" escapes. One
// class serves both CSV and TSV; the delimiter comes from ParseConfig.Delimited.Delimiter (defaulting
// from the instance Kind). Registered as a 'csv' instance and a 'tsv' instance by the provider.

const libParserProvider = require('./DataImport-ParserProvider.js');

class DataImportParserDelimited extends libParserProvider
{
	get Kind()
	{
		return this.options.Kind || 'csv';
	}

	/** @param {Record<string, any>} pParseConfig @return {{Delimiter:string, HasHeader:boolean, SampleRowLimit:number}} */
	_settings(pParseConfig)
	{
		const tmpDelimitedConfig = (pParseConfig && pParseConfig.Delimited) || {};
		const tmpDefaultDelimiter = (this.Kind === 'tsv') ? '\t' : ',';
		return {
			Delimiter: tmpDelimitedConfig.Delimiter || tmpDefaultDelimiter,
			HasHeader: (tmpDelimitedConfig.HasHeader !== false),
			SampleRowLimit: (pParseConfig && pParseConfig.SampleRowLimit) || 25,
		};
	}

	/**
	 * Parse delimited text into an array of cell-arrays (one per record), quote-aware + multiline-safe.
	 * @param {string} pText @param {string} pDelimiter @return {Array<Array<string>>}
	 */
	parseDelimited(pText, pDelimiter)
	{
		const tmpRows = [];
		let tmpRow = [];
		let tmpField = '';
		let tmpInQuotes = false;
		const tmpText = (pText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
		let tmpRowHasContent = false;

		for (let i = 0; i < tmpText.length; i++)
		{
			const tmpChar = tmpText[i];
			if (tmpInQuotes)
			{
				if (tmpChar === '"')
				{
					if (tmpText[i + 1] === '"') { tmpField += '"'; i++; }   // escaped doubled quote
					else { tmpInQuotes = false; }
				}
				else { tmpField += tmpChar; }
			}
			else if (tmpChar === '"')
			{
				tmpInQuotes = true;
				tmpRowHasContent = true;
			}
			else if (tmpChar === pDelimiter)
			{
				tmpRow.push(tmpField);
				tmpField = '';
				tmpRowHasContent = true;
			}
			else if (tmpChar === '\n')
			{
				tmpRow.push(tmpField);
				// Skip wholly-empty lines (a trailing newline shouldn't yield a blank record).
				if (tmpRowHasContent || tmpRow.length > 1 || tmpRow[0] !== '') { tmpRows.push(tmpRow); }
				tmpRow = [];
				tmpField = '';
				tmpRowHasContent = false;
			}
			else
			{
				tmpField += tmpChar;
				tmpRowHasContent = true;
			}
		}
		// Flush the final field/row if the file didn't end on a newline.
		if (tmpField !== '' || tmpRow.length > 0)
		{
			tmpRow.push(tmpField);
			if (tmpRowHasContent || tmpRow.length > 1 || tmpRow[0] !== '') { tmpRows.push(tmpRow); }
		}
		return tmpRows;
	}

	/** @param {number} pCount @return {Array<string>} Generated column names (Column1, Column2, …). */
	_generatedHeader(pCount)
	{
		const tmpHeader = [];
		for (let i = 0; i < pCount; i++) { tmpHeader.push(`Column${i + 1}`); }
		return tmpHeader;
	}

	detect(pFileHandle, pParseConfig)
	{
		const tmpSettings = this._settings(pParseConfig);
		return this._readText(pFileHandle).then((pText) =>
		{
			const tmpRows = this.parseDelimited(pText, tmpSettings.Delimiter);
			if (tmpRows.length === 0) { return { Columns: [], SampleRows: [], RowCountEstimate: 0 }; }
			const tmpHeader = tmpSettings.HasHeader ? tmpRows[0].map((pCell) => String(pCell).trim()) : this._generatedHeader(tmpRows[0].length);
			const tmpDataRows = tmpSettings.HasHeader ? tmpRows.slice(1) : tmpRows;
			return this._buildDetection(tmpHeader, tmpDataRows, tmpSettings.SampleRowLimit);
		});
	}

	parse(pFileHandle, pParseConfig)
	{
		const tmpSettings = this._settings(pParseConfig);
		return this._readText(pFileHandle).then((pText) =>
		{
			const tmpRows = this.parseDelimited(pText, tmpSettings.Delimiter);
			if (tmpRows.length === 0) { return []; }
			const tmpHeader = tmpSettings.HasHeader ? tmpRows[0].map((pCell) => String(pCell).trim()) : this._generatedHeader(tmpRows[0].length);
			const tmpDataRows = tmpSettings.HasHeader ? tmpRows.slice(1) : tmpRows;
			return tmpDataRows.map((pRow) =>
			{
				const tmpObject = {};
				for (let c = 0; c < tmpHeader.length; c++) { tmpObject[tmpHeader[c]] = (pRow[c] !== undefined) ? pRow[c] : ''; }
				return tmpObject;
			});
		});
	}
}

module.exports = DataImportParserDelimited;
