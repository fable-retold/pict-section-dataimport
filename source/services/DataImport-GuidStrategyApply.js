// DataImport-GuidStrategyApply — wires the meadow-integration GUID strategy compiler into a wizard
// mapping. Given the per-entity strategy config + the host context catalog + the resolved schema (for
// the GUID column widths), it compiles the strategy and attaches it to each entity mapping, then strips
// the GUID / FK fields the strategy now owns out of each entity's data Mappings.
//
// Thin glue over meadow-integration's engine (the composer + compiler live there, reused by the CLI +
// server endpoints too); this only knows the dataimport mapping shape. Pure + unit-testable.

const libEngine = require('meadow-integration/source/Meadow-Integration-Engine.js');

/**
 * Build { <entity>: <GUID column width> } from a resolved dataimport schema (Entities[].Fields[].Size,
 * IsGUID), so the composer can keep each entity's GUID inside its column.
 * @param {Record<string, any>} pSchema
 * @returns {Record<string, number>}
 */
function schemaSizes(pSchema)
{
	const tmpSizes = {};
	((pSchema && pSchema.Entities) || []).forEach((pEntity) =>
	{
		const tmpGUIDField = (pEntity.Fields || []).find((pField) => pField.IsGUID);
		if (tmpGUIDField && (Number(tmpGUIDField.Size) > 0))
		{
			tmpSizes[pEntity.Entity] = Number(tmpGUIDField.Size);
		}
	});
	return tmpSizes;
}

/**
 * Compile + attach GUID strategies to a mapping.
 * @param {Record<string, any>} pMapping - { Order, Entities:{ <name>: <entityMapping> } }
 * @param {Record<string, any>} pStrategyConfig - { Prefix?, Entities:{ <name>: <entityConfig> } }
 * @param {Record<string, any>} pCatalog - { <entity>:{ Abbrev, KeyField } }
 * @param {Record<string, any>} pSchema - resolved dataimport schema (for GUID column sizes)
 * @returns {{Mapping:Record<string, any>, Warnings:Array<string>}}
 */
function applyStrategy(pMapping, pStrategyConfig, pCatalog, pSchema)
{
	const tmpCompiled = libEngine.compileGUIDStrategy(pStrategyConfig || {}, { Catalog: pCatalog || {}, SchemaSizes: schemaSizes(pSchema) });
	const tmpEntities = (pMapping && pMapping.Entities) || {};

	Object.keys(tmpEntities).forEach((pEntityName) =>
	{
		const tmpStrategy = tmpCompiled.Strategies[pEntityName];
		if (!tmpStrategy) { return; }
		const tmpEntityMapping = tmpEntities[pEntityName];
		tmpEntityMapping.GUIDStrategy = tmpStrategy;

		// Strip the fields the strategy now stamps (own GUID + every FK field) out of the data Mappings,
		// so they aren't double-written by the flat-template Mappings loop.
		const tmpStrategyFields = {};
		if (tmpStrategy.Own && tmpStrategy.Own.FieldName) { tmpStrategyFields[tmpStrategy.Own.FieldName] = true; }
		(tmpStrategy.Joins || []).forEach((pJoin) => { if (pJoin.FieldName) { tmpStrategyFields[pJoin.FieldName] = true; } });
		if (tmpEntityMapping.Mappings)
		{
			Object.keys(tmpEntityMapping.Mappings).forEach((pField) =>
			{
				if (tmpStrategyFields[pField]) { delete tmpEntityMapping.Mappings[pField]; }
			});
		}
	});

	return { Mapping: pMapping, Warnings: tmpCompiled.Warnings || [] };
}

/**
 * Build a meadow-integration strategy config from the simplified per-entity UI model the wizard panel
 * edits. Each "parent link" becomes BOTH a context segment in the entity's own GUID (when prefixed) AND
 * a foreign-key join — which is the user's mental model (`UI_C10_P01278_LI8675309` embeds Contract +
 * Project context and the Line Item carries GUIDContract / GUIDProject FKs).
 * @param {Record<string, any>} pUIEntities - { <entity>: { Mode, OwnKeyColumn, Parents:[{Entity,KeyColumn,Mode,CrossSession}] } }
 * @param {string} pPrefix - the GUID prefix (e.g. 'UI')
 * @returns {{Prefix:string, Entities:Record<string, any>}}
 */
function buildStrategyConfig(pUIEntities, pPrefix)
{
	const tmpEntities = {};
	Object.keys(pUIEntities || {}).forEach((pEntityName) =>
	{
		const tmpUI = pUIEntities[pEntityName] || {};
		const tmpParents = Array.isArray(tmpUI.Parents) ? tmpUI.Parents : [];
		// Only prefixed parents contribute a context segment to the own GUID (raw / rawid carry an external
		// GUID / ID that has no composable key for the prefix).
		const tmpContextEntities = [];
		const tmpContextKeyColumns = {};
		tmpParents.forEach((pParent) =>
		{
			if ((pParent.Mode || 'prefixed') === 'prefixed' && pParent.Entity)
			{
				tmpContextEntities.push(pParent.Entity);
				tmpContextKeyColumns[pParent.Entity] = pParent.KeyColumn;
			}
		});
		tmpEntities[pEntityName] = {
			Mode: tmpUI.Mode || 'prefixed',
			OwnKeyColumn: tmpUI.OwnKeyColumn,
			// Combinatorial own key: several columns concatenated, or a user-typed pict template. The engine's
			// ownValueTemplate() prefers OwnKeyTemplate, then OwnKeyColumns, then the single OwnKeyColumn.
			OwnKeyColumns: Array.isArray(tmpUI.OwnKeyColumns) ? tmpUI.OwnKeyColumns : undefined,
			OwnKeyTemplate: tmpUI.OwnKeyTemplate,
			OwnGUIDColumn: tmpUI.OwnGUIDColumn,
			ContextEntities: tmpContextEntities,
			ContextKeyColumns: tmpContextKeyColumns,
			Joins: tmpParents.filter((pParent) => !!pParent.Entity).map((pParent) =>
			{
				const tmpMode = pParent.Mode || 'prefixed';
				return {
					ParentEntity: pParent.Entity,
					Mode: tmpMode,
					KeyColumn: pParent.KeyColumn,
					GUIDColumn: pParent.KeyColumn,
					IDColumn: pParent.KeyColumn,
					CrossSession: (pParent.CrossSession !== false),
				};
			}),
		};
	});
	return { Prefix: (pPrefix !== undefined) ? pPrefix : 'UI', Entities: tmpEntities };
}

/**
 * Preview the GUID a compose spec would produce for a sample row (simple `{~D:Record.X~}` resolution, no
 * fable needed) — used by the wizard panel to show a live example as the user configures the strategy.
 * @param {Record<string, any>} pComposeSpec @param {Record<string, any>} pSampleRow
 * @returns {string}
 */
function previewGUID(pComposeSpec, pSampleRow)
{
	if (!pComposeSpec || !Array.isArray(pComposeSpec.segments)) { return ''; }
	const tmpRow = pSampleRow || {};
	const tmpSegments = pComposeSpec.segments.map((pSegment) =>
	{
		// Resolve EVERY `{~D:Record.<col>~}` tag in the segment (a segment can now be multiple columns or a
		// typed template, not just one column) — a lightweight parseTemplate stand-in for the live preview.
		// Any non-tag literal text in the template is kept verbatim.
		const tmpValue = String(pSegment.valueTemplate || '').replace(/\{~D:Record\.([^~}]+)~\}/g, (pFull, pColumn) =>
		{
			const tmpCell = tmpRow[pColumn];
			return (tmpCell !== undefined && tmpCell !== null) ? String(tmpCell) : '';
		});
		return { abbrev: pSegment.abbrev, value: tmpValue };
	});
	return libEngine.composeGUID({ prefix: pComposeSpec.prefix, separator: pComposeSpec.separator, maxLength: pComposeSpec.maxLength, hashLength: pComposeSpec.hashLength, segments: tmpSegments });
}

/**
 * One-call preview for the wizard panel: build the config from the UI model, compile it, and preview the
 * given entity's OWN GUID on a sample row.
 * @returns {string}
 */
function previewEntityGUID(pUIEntities, pPrefix, pCatalog, pSchema, pEntityName, pSampleRow)
{
	const tmpConfig = buildStrategyConfig(pUIEntities, pPrefix);
	const tmpCompiled = libEngine.compileGUIDStrategy(tmpConfig, { Catalog: pCatalog || {}, SchemaSizes: schemaSizes(pSchema) });
	const tmpStrategy = tmpCompiled.Strategies[pEntityName];
	if (!tmpStrategy || !tmpStrategy.Own || !tmpStrategy.Own.Compose) { return ''; }
	return previewGUID(tmpStrategy.Own.Compose, pSampleRow);
}

module.exports = {
	applyStrategy,
	schemaSizes,
	buildStrategyConfig,
	previewGUID,
	previewEntityGUID,
};
