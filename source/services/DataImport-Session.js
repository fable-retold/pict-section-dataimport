// DataImport-Session — the per-import-session state shape + (de)serialization helpers.
//
// One session lives at AppData.DataImport.Sessions[<wizardHash>] and is fully JSON-serializable: the
// live uploaded file handle is referenced indirectly (File.Ref), never embedded, so a StateStore can
// persist a partially-mapped session and reload it later. `Mapping` is the durable artifact;
// `Comprehension` is a recomputable cache (re-derivable from Mapping + re-parsed rows).

/** @return {number} A timestamp (plain module code — Date.now is fine here). */
const now = () => Date.now();

/**
 * Build a fresh import session.
 * @param {string} pSessionId @param {Record<string, any>} pConfig
 * @return {Record<string, any>}
 */
const newImportSession = (pSessionId, pConfig) =>
{
	const tmpConfig = pConfig || {};
	const tmpTimestamp = now();
	return {
		SessionId: pSessionId,
		Title: tmpConfig.Title || pSessionId,
		SchemaVersion: 1,
		CreatedAt: tmpTimestamp,
		UpdatedAt: tmpTimestamp,

		CurrentStep: 'upload',     // upload | detect | mapping | generate | push
		StepStatus: { upload: 'active', detect: 'pending', mapping: 'pending', generate: 'pending', push: 'pending' },

		// File REF (not the live handle/bytes): { Ref, Name, Size, Type, Kind, Stored, StorageRef }.
		File: null,

		ParseConfig:
		{
			Kind: null,            // csv | tsv | fixedwidth | xlsx
			Delimited: { Delimiter: ',', HasHeader: true },
			FixedWidth: { Columns: [], HasHeader: false },
			Xlsx: { HasHeader: true },
			SampleRowLimit: 25,
		},
		DetectedColumns: [],
		SampleRows: [],
		RawLines: [],              // fixed-width ruler source (when no column spec yet)
		RowCountEstimate: 0,

		Mapping:
		{
			TargetSchemaSource: tmpConfig.SchemaSource || 'meadow',
			Order: [],
			Entities: {},          // <entityName>: { Entity, GUIDName, GUIDTemplate, Mappings, Solvers, MultipleGUIDUniqueness, _ColumnBindings }
		},

		Comprehension: null,       // recomputable cache: { <Entity>: { <guid>: record } }
		GenerationReport: null,    // { ParsedRowCount, EntityCounts, BadRecords }

		Push:
		{
			Mode: tmpConfig.PushMode || 'entityprovider',
			Status: 'idle',        // idle | running | complete | error
			Progress: { Total: 0, Pushed: 0 },
			Result: null,
			Error: null,
		},
	};
};

/**
 * A JSON-safe snapshot for persistence. The Comprehension can be huge + is recomputable, so it is
 * dropped by default (pass pIncludeComprehension to keep it).
 * @param {Record<string, any>} pSession @param {boolean} [pIncludeComprehension]
 * @return {Record<string, any>}
 */
const serialize = (pSession, pIncludeComprehension) =>
{
	const tmpSnapshot = JSON.parse(JSON.stringify(pSession || {}));
	if (!pIncludeComprehension) { tmpSnapshot.Comprehension = null; }
	tmpSnapshot.UpdatedAt = now();
	return tmpSnapshot;
};

/**
 * Rebuild a session object from a snapshot (filling any new fields a newer SchemaVersion added).
 * @param {Record<string, any>} pSnapshot
 * @return {Record<string, any>}
 */
const hydrate = (pSnapshot) =>
{
	const tmpSnapshot = pSnapshot || {};
	const tmpBase = newImportSession(tmpSnapshot.SessionId || 'import', {});
	// Deep-merge the saved fields over the fresh base (saved values win; new base fields survive).
	return Object.assign(tmpBase, tmpSnapshot, {
		ParseConfig: Object.assign({}, tmpBase.ParseConfig, tmpSnapshot.ParseConfig),
		Mapping: Object.assign({}, tmpBase.Mapping, tmpSnapshot.Mapping),
		Push: Object.assign({}, tmpBase.Push, tmpSnapshot.Push),
	});
};

/** Mark a session's UpdatedAt. @param {Record<string, any>} pSession */
const touch = (pSession) => { if (pSession) { pSession.UpdatedAt = now(); } return pSession; };

module.exports = { newImportSession, serialize, hydrate, touch };
