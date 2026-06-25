// Pict-Provider-DataImport-Meadow — the Meadow-specific seam adapters: a SchemaProvider that reads
// entity schemas from a live Meadow server, and a PushTarget that lands comprehension records via the
// browser EntityProvider + meadow-integration's Integration Adapter (GUID marshaling + FK resolution).
//
// This file (plus the ComprehensionBuilder) is where the meadow-integration engine is touched; it is
// only required when SchemaSource:'meadow' or PushMode:'entityprovider' is used. The engine is reached
// through the browser-clean Meadow-Integration-Engine re-export (no server-only code).

const libEngine = require('meadow-integration/source/Meadow-Integration-Engine.js');
const libSchemaProvider = require('../seams/DataImport-SchemaProvider.js');
const libPushTarget = require('../seams/DataImport-PushTarget.js');

/**
 * Wrap pict.EntityProvider as an Integration-Adapter REST client: adds getJSON (prefixed, for the
 * schema fetch) + getEntityByGUID (via a filtered getEntitySet, used by the adapter's fallback path),
 * and delegates upsert/get/delete straight through.
 * @param {any} pPict @param {string} pURLPrefix @return {Record<string, any>}
 */
const makeEntityProviderShim = (pPict, pURLPrefix) =>
{
	const tmpEntityProvider = pPict.EntityProvider;
	const tmpPrefix = pURLPrefix || (tmpEntityProvider.options && tmpEntityProvider.options.urlPrefix) || '/1.0/';
	return {
		serverURL: tmpPrefix,
		restClient: tmpEntityProvider.restClient,
		getJSON: (pURL, fCallback) =>
		{
			// The adapter passes an unprefixed 'Entity/Schema' — prepend the base URL unless already absolute.
			const tmpFullURL = (pURL.indexOf('http') === 0 || pURL.indexOf(tmpPrefix) === 0) ? pURL : (tmpPrefix + pURL);
			return tmpEntityProvider.restClient.getJSON(tmpFullURL, fCallback);
		},
		getEntity: (pEntity, pID, fCallback) => tmpEntityProvider.getEntity(pEntity, pID, fCallback),
		upsertEntity: (pEntity, pRecord, fCallback) => tmpEntityProvider.upsertEntity(pEntity, pRecord, fCallback),
		upsertEntities: (pEntity, pRecords, fCallback) => tmpEntityProvider.upsertEntities(pEntity, pRecords, fCallback),
		deleteEntity: (pEntity, pID, fCallback) => tmpEntityProvider.deleteEntity(pEntity, pID, fCallback),
		getEntityByGUID: (pEntity, pGUID, fCallback) =>
		{
			const tmpFilter = `FBV~GUID${pEntity}~EQ~${encodeURIComponent(pGUID)}`;
			tmpEntityProvider.getEntitySet(pEntity, tmpFilter, (pError, pRecords) =>
			{
				if (pError) { return fCallback(pError); }
				return fCallback(null, (Array.isArray(pRecords) && pRecords.length > 0) ? pRecords[0] : null);
			});
		},
	};
};

/**
 * SchemaProvider that reads each configured Meadow entity's schema from <URLPrefix><Entity>/Schema,
 * mapping it to the dataimport schema shape (inferring foreign keys from ID<Other> columns).
 */
class DataImportSchemaProviderMeadow extends libSchemaProvider
{
	getSchema()
	{
		const tmpEntities = Array.isArray(this.options.MeadowEntities) ? this.options.MeadowEntities : [];
		const tmpPrefix = this.options.URLPrefix || '/1.0/';
		const tmpEntityProvider = this.pict.EntityProvider;
		if (!tmpEntityProvider || !tmpEntityProvider.restClient)
		{
			return Promise.reject(new Error('pict-section-dataimport: a Meadow schema source needs pict.EntityProvider.'));
		}

		return Promise.all(tmpEntities.map((pEntityName) => new Promise((resolve) =>
		{
			tmpEntityProvider.restClient.getJSON(`${tmpPrefix}${pEntityName}/Schema`, (pError, pResponse, pParsedBody) =>
			{
				const tmpSchemaBody = (pParsedBody && typeof pParsedBody === 'object') ? pParsedBody
					: ((pResponse && typeof pResponse === 'object') ? pResponse : {});
				resolve(this._mapMeadowEntitySchema(pEntityName, tmpSchemaBody, tmpEntities));
			});
		}))).then((pEntityList) =>
		{
			return { Entities: pEntityList, Order: this._deriveOrder(pEntityList) };
		});
	}

	/** Map a Meadow /Schema body to the { Entity, GUIDName, Fields } shape. */
	_mapMeadowEntitySchema(pEntityName, pSchemaBody, pAllEntities)
	{
		const tmpGUIDName = `GUID${pEntityName}`;
		let tmpColumns = [];
		if (Array.isArray(pSchemaBody.Columns)) { tmpColumns = pSchemaBody.Columns; }
		else if (pSchemaBody.Schema && Array.isArray(pSchemaBody.Schema)) { tmpColumns = pSchemaBody.Schema; }
		else if (pSchemaBody.properties && typeof pSchemaBody.properties === 'object')
		{
			tmpColumns = Object.keys(pSchemaBody.properties).map((pKey) => Object.assign({ Column: pKey }, pSchemaBody.properties[pKey]));
		}

		// Audit / lifecycle columns Meadow stamps on every entity — noise in a column-mapping UI.
		const tmpSystemColumns = { CreateDate: 1, CreatingIDUser: 1, UpdateDate: 1, UpdatingIDUser: 1, Deleted: 1, DeleteDate: 1, DeletingIDUser: 1 };
		const tmpFields = tmpColumns.map((pColumn) =>
		{
			const tmpName = pColumn.Column || pColumn.Name || pColumn.column;
			let tmpForeignKeyEntity = '';
			if (tmpName && tmpName.indexOf('ID') === 0 && tmpName.length > 2)
			{
				const tmpReferenced = tmpName.slice(2);
				if (pAllEntities.indexOf(tmpReferenced) >= 0 && tmpReferenced !== pEntityName) { tmpForeignKeyEntity = tmpReferenced; }
			}
			return {
				Name: tmpName,
				Type: pColumn.DataType || pColumn.Type || pColumn.type || 'string',
				Size: Number(pColumn.Size || pColumn.size || 0) || 0,
				Required: !!(pColumn.Required || pColumn.NonNull),
				IsGUID: (tmpName === tmpGUIDName),
				ForeignKeyEntity: tmpForeignKeyEntity,
			};
		}).filter((pField) => !!pField.Name
			&& pField.Name !== `ID${pEntityName}`        // the auto-increment primary key
			&& !tmpSystemColumns[pField.Name]);          // audit/lifecycle columns

		return { Entity: pEntityName, GUIDName: tmpGUIDName, Fields: tmpFields };
	}

	/** Order entities referenced-before-referrer (entities with fewer outbound FKs first). */
	_deriveOrder(pEntityList)
	{
		const tmpNames = pEntityList.map((pEntity) => pEntity.Entity);
		const tmpFKCount = {};
		pEntityList.forEach((pEntity) =>
		{
			tmpFKCount[pEntity.Entity] = pEntity.Fields.filter((pField) => pField.ForeignKeyEntity && tmpNames.indexOf(pField.ForeignKeyEntity) >= 0).length;
		});
		// Stable sort by outbound-FK count: zero-FK reference entities first, join tables last.
		return tmpNames.slice().sort((pA, pB) => (tmpFKCount[pA] - tmpFKCount[pB]));
	}
}

/**
 * PushTarget that lands comprehension records via pict.EntityProvider, using a fresh Integration
 * Adapter per entity (so GUID marshaling + FK resolution run through meadow-integration). Entities are
 * pushed sequentially IN ORDER so each referenced entity's GUID->ID mappings populate the shared
 * MeadowGUIDMap before a referrer marshals its foreign keys.
 */
class DataImportPushTargetEntityProvider extends libPushTarget
{
	push(pComprehension, pContext)
	{
		const tmpContext = pContext || {};
		const tmpOrder = (Array.isArray(tmpContext.Order) && tmpContext.Order.length > 0) ? tmpContext.Order : Object.keys(pComprehension || {});
		const tmpShim = makeEntityProviderShim(this.pict, tmpContext.ServerURL || tmpContext.URLPrefix);
		const tmpPushed = [];
		let tmpTotal = 0;
		tmpOrder.forEach((pEntity) => { tmpTotal += Object.keys((pComprehension && pComprehension[pEntity]) || {}).length; });
		let tmpDone = 0;

		// Sequential reduce over the ordered entities (referenced entities first).
		return tmpOrder.reduce((pPromise, pEntity) => pPromise.then(() =>
		{
			const tmpRecords = (pComprehension && pComprehension[pEntity]) || {};
			const tmpGUIDs = Object.keys(tmpRecords);
			if (tmpGUIDs.length === 0) { return; }

			const tmpAdapterOptions = Object.assign({}, libEngine.MeadowIntegrationAdapter.default_configuration,
				{
					Entity: pEntity,
					EntityGUIDMarshalPrefix: tmpContext.EntityGUIDPrefix || `E-${pEntity}`,
					AdapterSetGUIDMarshalPrefix: tmpContext.GUIDPrefix || 'INTG-DEF',
					SimpleMarshal: true,
					ForceMarshal: true,
					PerformDeletes: false,
					AllowGUIDTruncation: !!tmpContext.AllowGUIDTruncation,
				});
			const tmpAdapter = new libEngine.MeadowIntegrationAdapter(this.pict, tmpAdapterOptions, `DataImport-${pEntity}`);
			tmpAdapter.setRestClient(tmpShim);
			tmpGUIDs.forEach((pGUID) => tmpAdapter.addSourceRecord(tmpRecords[pGUID]));

			return new Promise((resolve, reject) =>
			{
				tmpAdapter.integrateRecords((pError) =>
				{
					if (pError) { return reject(pError); }
					tmpPushed.push(pEntity);
					tmpDone += tmpGUIDs.length;
					if (typeof tmpContext.onProgress === 'function') { tmpContext.onProgress(tmpDone, tmpTotal); }
					return resolve();
				});
			});
		}), Promise.resolve()).then(() =>
		{
			return { Success: true, EntitiesPushed: tmpPushed, Message: `Pushed ${tmpDone} record(s) across ${tmpPushed.length} entity(ies) via EntityProvider.` };
		});
	}
}

module.exports =
{
	makeEntityProviderShim,
	DataImportSchemaProviderMeadow,
	DataImportPushTargetEntityProvider,
};
