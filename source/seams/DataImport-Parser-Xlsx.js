// DataImport-Parser-Xlsx — Excel parser, wrapping SheetJS (xlsx). LAZY-required so the ~1MB library
// is only pulled into the bundle/process when xlsx import is actually used; xlsx is an OPTIONAL peer
// dependency (the default AllowedFileTypes can omit 'xlsx' entirely). Reads the first worksheet.

const libParserProvider = require('./DataImport-ParserProvider.js');

class DataImportParserXlsx extends libParserProvider
{
	get Kind()
	{
		return this.options.Kind || 'xlsx';
	}

	/** @return {any} The xlsx library, or throws a friendly error if it isn't installed. */
	_xlsx()
	{
		if (this._xlsxLib) { return this._xlsxLib; }
		try { this._xlsxLib = require('xlsx'); }
		catch (pError) { throw new Error('pict-section-dataimport: xlsx import needs the optional "xlsx" (SheetJS) dependency installed.'); }
		return this._xlsxLib;
	}

	/** @param {Record<string, any>} pParseConfig @return {Promise<Array<Array<any>>>} The sheet as array-of-arrays. */
	_readSheetMatrix(pFileHandle, pParseConfig)
	{
		const tmpXLSX = this._xlsx();
		return this._readArrayBuffer(pFileHandle).then((pBuffer) =>
		{
			const tmpWorkbook = tmpXLSX.read(pBuffer, { type: 'array' });
			const tmpSheetName = (pParseConfig && pParseConfig.Xlsx && pParseConfig.Xlsx.SheetName) || tmpWorkbook.SheetNames[0];
			const tmpSheet = tmpWorkbook.Sheets[tmpSheetName];
			if (!tmpSheet) { return []; }
			// header:1 → array-of-arrays; blank cells become '' so columns line up.
			return tmpXLSX.utils.sheet_to_json(tmpSheet, { header: 1, defval: '', blankrows: false });
		});
	}

	_settings(pParseConfig)
	{
		const tmpXlsxConfig = (pParseConfig && pParseConfig.Xlsx) || {};
		return {
			HasHeader: (tmpXlsxConfig.HasHeader !== false),
			SampleRowLimit: (pParseConfig && pParseConfig.SampleRowLimit) || 25,
		};
	}

	detect(pFileHandle, pParseConfig)
	{
		const tmpSettings = this._settings(pParseConfig);
		return this._readSheetMatrix(pFileHandle, pParseConfig).then((pMatrix) =>
		{
			if (!pMatrix || pMatrix.length === 0) { return { Columns: [], SampleRows: [], RowCountEstimate: 0 }; }
			const tmpHeader = tmpSettings.HasHeader
				? pMatrix[0].map((pCell) => String(pCell).trim())
				: pMatrix[0].map((pCell, pIndex) => `Column${pIndex + 1}`);
			const tmpDataRows = tmpSettings.HasHeader ? pMatrix.slice(1) : pMatrix;
			return this._buildDetection(tmpHeader, tmpDataRows, tmpSettings.SampleRowLimit);
		});
	}

	parse(pFileHandle, pParseConfig)
	{
		const tmpSettings = this._settings(pParseConfig);
		return this._readSheetMatrix(pFileHandle, pParseConfig).then((pMatrix) =>
		{
			if (!pMatrix || pMatrix.length === 0) { return []; }
			const tmpHeader = tmpSettings.HasHeader
				? pMatrix[0].map((pCell) => String(pCell).trim())
				: pMatrix[0].map((pCell, pIndex) => `Column${pIndex + 1}`);
			const tmpDataRows = tmpSettings.HasHeader ? pMatrix.slice(1) : pMatrix;
			return tmpDataRows.map((pRow) =>
			{
				const tmpObject = {};
				for (let c = 0; c < tmpHeader.length; c++) { tmpObject[tmpHeader[c]] = (pRow[c] !== undefined) ? pRow[c] : ''; }
				return tmpObject;
			});
		});
	}
}

module.exports = DataImportParserXlsx;
