// DataImport-ParserProvider — the abstract file-parser seam.
//
// A parser turns an uploaded file handle (the pict-section-upload shape: { Name, Size, Type,
// getText(cb), getArrayBuffer(cb) }) into (a) a DETECTION result for the validate/map UI — detected
// columns + sample rows + an estimated row count — and (b) a full row stream for comprehension
// generation. Hosts can register custom parsers (e.g. EBCDIC, a bespoke binary) by extending this and
// registering the instance under a file kind. The module stays format-agnostic behind this seam.

class DataImportParserProvider
{
	/**
	 * @param {any} pPict @param {Record<string, any>} pOptions
	 */
	constructor(pPict, pOptions)
	{
		this.pict = pPict;
		this.options = pOptions || {};
	}

	/** @return {string} The file kind this parser handles ('csv' | 'tsv' | 'fixedwidth' | 'xlsx' | custom). */
	get Kind()
	{
		return this.options.Kind || 'base';
	}

	/**
	 * Inspect a file: return the detected columns, a sample of rows, and an estimated total row count.
	 * @param {Record<string, any>} pFileHandle @param {Record<string, any>} pParseConfig
	 * @return {Promise<{Columns:Array<any>, SampleRows:Array<any>, RowCountEstimate:number, RawLines?:Array<string>}>}
	 */
	detect(pFileHandle, pParseConfig)
	{
		return Promise.reject(new Error(`pict-section-dataimport: parser [${this.Kind}] does not implement detect().`));
	}

	/**
	 * Parse the whole file into an array of row objects (keyed by column name).
	 * @param {Record<string, any>} pFileHandle @param {Record<string, any>} pParseConfig
	 * @return {Promise<Array<Record<string, any>>>}
	 */
	parse(pFileHandle, pParseConfig)
	{
		return Promise.reject(new Error(`pict-section-dataimport: parser [${this.Kind}] does not implement parse().`));
	}

	/** Read a file handle's text content as a Promise. @param {Record<string, any>} pFileHandle @return {Promise<string>} */
	_readText(pFileHandle)
	{
		return new Promise((resolve, reject) =>
		{
			if (!pFileHandle || typeof pFileHandle.getText !== 'function')
			{
				return reject(new Error('pict-section-dataimport: file handle has no getText().'));
			}
			pFileHandle.getText((pError, pText) => (pError ? reject(pError) : resolve(pText || '')));
		});
	}

	/** Read a file handle's bytes as a Promise. @param {Record<string, any>} pFileHandle @return {Promise<ArrayBuffer>} */
	_readArrayBuffer(pFileHandle)
	{
		return new Promise((resolve, reject) =>
		{
			if (!pFileHandle || typeof pFileHandle.getArrayBuffer !== 'function')
			{
				return reject(new Error('pict-section-dataimport: file handle has no getArrayBuffer().'));
			}
			pFileHandle.getArrayBuffer((pError, pBuffer) => (pError ? reject(pError) : resolve(pBuffer)));
		});
	}

	/**
	 * Cheap value-type inference for the detected-columns UI (presentational only — never coerces data).
	 * @param {Array<any>} pValues @return {string} 'integer' | 'number' | 'boolean' | 'date' | 'string'
	 */
	_inferType(pValues)
	{
		const tmpSample = (pValues || []).filter((pValue) => pValue !== undefined && pValue !== null && String(pValue).trim() !== '');
		if (tmpSample.length === 0) { return 'string'; }
		let tmpAllInteger = true;
		let tmpAllNumber = true;
		let tmpAllBoolean = true;
		let tmpAllDate = true;
		for (let i = 0; i < tmpSample.length; i++)
		{
			const tmpValue = String(tmpSample[i]).trim();
			if (!/^-?\d+$/.test(tmpValue)) { tmpAllInteger = false; }
			if (!/^-?\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(tmpValue)) { tmpAllNumber = false; }
			if (!/^(true|false|yes|no|0|1)$/i.test(tmpValue)) { tmpAllBoolean = false; }
			if (isNaN(Date.parse(tmpValue))) { tmpAllDate = false; }
		}
		if (tmpAllInteger) { return 'integer'; }
		if (tmpAllNumber) { return 'number'; }
		if (tmpAllBoolean) { return 'boolean'; }
		if (tmpAllDate) { return 'date'; }
		return 'string';
	}

	/**
	 * Build the {Columns, SampleRows, RowCountEstimate} detection result from a header + data rows.
	 * @param {Array<string>} pHeader @param {Array<Array<any>>} pDataRows @param {number} pSampleLimit
	 * @return {{Columns:Array<any>, SampleRows:Array<any>, RowCountEstimate:number}}
	 */
	_buildDetection(pHeader, pDataRows, pSampleLimit)
	{
		const tmpLimit = pSampleLimit || 25;
		const tmpSampleRows = [];
		for (let i = 0; i < Math.min(pDataRows.length, tmpLimit); i++)
		{
			const tmpRowObject = {};
			for (let c = 0; c < pHeader.length; c++) { tmpRowObject[pHeader[c]] = pDataRows[i][c]; }
			tmpSampleRows.push(tmpRowObject);
		}
		const tmpColumns = pHeader.map((pName, pIndex) =>
		{
			const tmpColumnValues = pDataRows.slice(0, tmpLimit).map((pRow) => pRow[pIndex]);
			return { Index: pIndex, SourceName: pName, InferredType: this._inferType(tmpColumnValues), SampleValues: tmpColumnValues.slice(0, 3) };
		});
		return { Columns: tmpColumns, SampleRows: tmpSampleRows, RowCountEstimate: pDataRows.length };
	}
}

module.exports = DataImportParserProvider;
