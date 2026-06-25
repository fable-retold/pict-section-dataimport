// DataImport-Parser-FixedWidth — fixed-width / column-position file parser (hand-rolled, no dependency).
//
// Fixed-width files have no reliable auto-detect, so detect() with NO column spec returns the raw
// lines (so the validate UI can show a monospaced ruler for the user to define boundaries). Once
// ParseConfig.FixedWidth.Columns is set (each { Name, Start, End } — End exclusive, 0-based), detect()
// and parse() slice + trim each line into fields.

const libParserProvider = require('./DataImport-ParserProvider.js');

class DataImportParserFixedWidth extends libParserProvider
{
	get Kind()
	{
		return this.options.Kind || 'fixedwidth';
	}

	/** @param {Record<string, any>} pParseConfig @return {{Columns:Array<any>, HasHeader:boolean, SampleRowLimit:number}} */
	_settings(pParseConfig)
	{
		const tmpFixedConfig = (pParseConfig && pParseConfig.FixedWidth) || {};
		return {
			Columns: Array.isArray(tmpFixedConfig.Columns) ? tmpFixedConfig.Columns : [],
			HasHeader: !!tmpFixedConfig.HasHeader,
			SampleRowLimit: (pParseConfig && pParseConfig.SampleRowLimit) || 25,
		};
	}

	/** @param {string} pText @return {Array<string>} Non-empty lines. */
	_lines(pText)
	{
		return (pText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((pLine) => pLine.length > 0);
	}

	/** Slice one line into a cell array per the column spec. @param {string} pLine @param {Array<any>} pColumns @return {Array<string>} */
	_sliceLine(pLine, pColumns)
	{
		return pColumns.map((pColumn) =>
		{
			const tmpStart = (typeof pColumn.Start === 'number') ? pColumn.Start : 0;
			const tmpEnd = (typeof pColumn.End === 'number') ? pColumn.End : pLine.length;
			return pLine.substring(tmpStart, tmpEnd).trim();
		});
	}

	detect(pFileHandle, pParseConfig)
	{
		const tmpSettings = this._settings(pParseConfig);
		return this._readText(pFileHandle).then((pText) =>
		{
			const tmpLines = this._lines(pText);
			// No column spec yet — hand the raw lines back so the UI can render a boundary ruler.
			if (tmpSettings.Columns.length === 0)
			{
				return { Columns: [], SampleRows: [], RowCountEstimate: tmpLines.length, RawLines: tmpLines.slice(0, tmpSettings.SampleRowLimit) };
			}
			const tmpHeader = tmpSettings.Columns.map((pColumn) => pColumn.Name);
			const tmpDataLines = tmpSettings.HasHeader ? tmpLines.slice(1) : tmpLines;
			const tmpDataRows = tmpDataLines.map((pLine) => this._sliceLine(pLine, tmpSettings.Columns));
			const tmpDetection = this._buildDetection(tmpHeader, tmpDataRows, tmpSettings.SampleRowLimit);
			tmpDetection.RawLines = tmpLines.slice(0, tmpSettings.SampleRowLimit);
			return tmpDetection;
		});
	}

	parse(pFileHandle, pParseConfig)
	{
		const tmpSettings = this._settings(pParseConfig);
		if (tmpSettings.Columns.length === 0)
		{
			return Promise.reject(new Error('pict-section-dataimport: fixed-width parse requires a column spec (ParseConfig.FixedWidth.Columns).'));
		}
		return this._readText(pFileHandle).then((pText) =>
		{
			const tmpHeader = tmpSettings.Columns.map((pColumn) => pColumn.Name);
			const tmpDataLines = tmpSettings.HasHeader ? this._lines(pText).slice(1) : this._lines(pText);
			return tmpDataLines.map((pLine) =>
			{
				const tmpCells = this._sliceLine(pLine, tmpSettings.Columns);
				const tmpObject = {};
				for (let c = 0; c < tmpHeader.length; c++) { tmpObject[tmpHeader[c]] = tmpCells[c]; }
				return tmpObject;
			});
		});
	}
}

module.exports = DataImportParserFixedWidth;
