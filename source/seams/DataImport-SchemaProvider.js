// DataImport-SchemaProvider — the abstract target-schema seam, plus the built-in config-schema
// adapter (a complex, non-Meadow schema supplied entirely by host configuration).
//
// getSchema() returns the target entities + fields the mapping step maps columns ONTO:
//   { Entities: [ { Entity, GUIDName, Fields: [ { Name, Type, Size, Required, IsGUID, ForeignKeyEntity,
//     FKGUIDTemplate } ] } ], Order: [ entityName, ... ] }
// The Meadow adapter (which fetches <URLPrefix><Entity>/Schema) lives in Pict-Provider-DataImport-Meadow.js
// so this file — and the whole core — stays free of any Meadow/EntityProvider dependency.

class DataImportSchemaProvider
{
	constructor(pPict, pOptions)
	{
		this.pict = pPict;
		this.options = pOptions || {};
	}

	/**
	 * @param {Record<string, any>} pContext
	 * @return {Promise<{Entities:Array<any>, Order:Array<string>}>}
	 */
	getSchema(pContext)
	{
		return Promise.reject(new Error('pict-section-dataimport: SchemaProvider does not implement getSchema().'));
	}

	/** Normalize a raw schema descriptor: default GUIDName, ensure Fields arrays + an Order. @param {Record<string, any>} pSchema */
	_normalizeSchema(pSchema)
	{
		const tmpEntities = (pSchema && Array.isArray(pSchema.Entities)) ? pSchema.Entities : [];
		const tmpNormalized = tmpEntities.map((pEntity) =>
		{
			return {
				Entity: pEntity.Entity,
				GUIDName: pEntity.GUIDName || `GUID${pEntity.Entity}`,
				GUIDTemplateDefault: pEntity.GUIDTemplateDefault || '',
				Fields: Array.isArray(pEntity.Fields) ? pEntity.Fields.map((pField) =>
				{
					return Object.assign({
						Name: pField.Name,
						Type: pField.Type || 'string',
						Size: (typeof pField.Size === 'number') ? pField.Size : 0,
						Required: !!pField.Required,
						IsGUID: (pField.IsGUID !== undefined) ? !!pField.IsGUID : (pField.Name === (pEntity.GUIDName || `GUID${pEntity.Entity}`)),
						ForeignKeyEntity: pField.ForeignKeyEntity || '',
						FKGUIDTemplate: pField.FKGUIDTemplate || '',
					}, pField);
				}) : [],
			};
		});
		const tmpOrder = (pSchema && Array.isArray(pSchema.Order) && pSchema.Order.length > 0)
			? pSchema.Order
			: tmpNormalized.map((pEntity) => pEntity.Entity);
		return { Entities: tmpNormalized, Order: tmpOrder };
	}
}

/**
 * Built-in adapter: the target schema is a descriptor passed directly in host config (the
 * "complex REST schema defined by configuration" case). No network — just normalization.
 */
class DataImportSchemaProviderConfig extends DataImportSchemaProvider
{
	getSchema()
	{
		const tmpSchema = this.options.Schema || { Entities: [] };
		return Promise.resolve(this._normalizeSchema(tmpSchema));
	}
}

module.exports = DataImportSchemaProvider;
module.exports.DataImportSchemaProviderConfig = DataImportSchemaProviderConfig;
