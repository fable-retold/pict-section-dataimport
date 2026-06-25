// DataImport-ComprehensionBuilder — turns a mapping + parsed rows into a Comprehension, using
// meadow-integration's browser-safe transform engine (reached via the clean Meadow-Integration-Engine
// re-export, which pulls in NO server-only code — verified). This is the only client-side piece that
// needs the engine, and it's the heart of the module: it runs the canonical transformRecord pipeline
// (Solvers + MultipleGUIDUniqueness fan-out) so the comprehensions are byte-identical to what the
// meadow-integration CLI would produce from the same mapping files.

const libEngine = require('meadow-integration/source/Meadow-Integration-Engine.js');

class DataImportComprehensionBuilder
{
	/**
	 * @param {any} pPict
	 * @param {any} [pTransform] - inject a transform engine (tests); else one is built from the engine export.
	 */
	constructor(pPict, pTransform)
	{
		this.pict = pPict;
		this.transform = pTransform || new libEngine.MeadowIntegrationTabularTransform(pPict);
	}

	/**
	 * Build a comprehension from a multi-entity mapping + parsed rows.
	 * @param {Record<string, any>} pMapping - { Order:[entityName,…], Entities:{ <name>: <entityMapping> } }
	 *   where each entityMapping is the meadow mapping shape: { Entity, GUIDName?, GUIDTemplate, Mappings,
	 *   Solvers?, MultipleGUIDUniqueness?, ManyfestAddresses? }.
	 * @param {Array<Record<string, any>>} pRows
	 * @return {{Comprehension:Record<string, any>, Report:Record<string, any>}}
	 */
	build(pMapping, pRows)
	{
		const tmpRows = Array.isArray(pRows) ? pRows : [];
		const tmpEntities = (pMapping && pMapping.Entities) || {};
		const tmpOrder = (pMapping && Array.isArray(pMapping.Order) && pMapping.Order.length > 0)
			? pMapping.Order
			: Object.keys(tmpEntities);

		const tmpComprehension = {};
		const tmpReport = { ParsedRowCount: tmpRows.length, EntityCounts: {}, BadRecords: [] };

		// Process entities IN ORDER so the comprehension's keys come out referenced-before-referrer
		// (the push paths do no topo-sort — emission order is load-bearing for FK resolution).
		for (let e = 0; e < tmpOrder.length; e++)
		{
			const tmpEntityKey = tmpOrder[e];
			const tmpEntityMapping = tmpEntities[tmpEntityKey];
			if (!tmpEntityMapping || !tmpEntityMapping.Entity) { continue; }

			const tmpOutcome = this.transform.newMappingOutcomeObject();
			// Set a truthy ImplicitConfiguration so the engine's implicit-generation branch (which would
			// otherwise dereference an undefined variable) never runs; our explicit mapping is authoritative.
			tmpOutcome.ImplicitConfiguration = {};
			tmpOutcome.ExplicitConfiguration = tmpEntityMapping;
			this.transform.initializeMappingOutcomeObject(tmpOutcome);

			for (let r = 0; r < tmpRows.length; r++)
			{
				try { this.transform.transformRecord(tmpRows[r], tmpOutcome); }
				catch (pError)
				{
					tmpReport.BadRecords.push({ Entity: tmpEntityMapping.Entity, RowIndex: r, Reason: pError.message || String(pError), Row: tmpRows[r] });
				}
			}

			const tmpEntityName = tmpEntityMapping.Entity;
			tmpComprehension[tmpEntityName] = tmpOutcome.Comprehension[tmpEntityName] || {};
			tmpReport.EntityCounts[tmpEntityName] = Object.keys(tmpComprehension[tmpEntityName]).length;
			(tmpOutcome.BadRecords || []).forEach((pBadRow) =>
			{
				tmpReport.BadRecords.push({ Entity: tmpEntityName, Reason: 'No valid GUID generated for record', Row: pBadRow });
			});
		}

		return { Comprehension: tmpComprehension, Report: tmpReport };
	}

	/**
	 * Pre-flight FK-ordering check: flag any `GUID<Other>` mapping field whose referenced entity appears
	 * LATER than (or not in) the Order — those FKs would silently resolve to NULL/0 at push time.
	 * @param {Record<string, any>} pMapping
	 * @return {Array<{Entity:string, Field:string, ReferencedEntity:string, Message:string}>}
	 */
	validateForeignKeyOrder(pMapping)
	{
		const tmpEntities = (pMapping && pMapping.Entities) || {};
		const tmpOrder = (pMapping && Array.isArray(pMapping.Order) && pMapping.Order.length > 0)
			? pMapping.Order
			: Object.keys(tmpEntities);
		const tmpEntityNames = tmpOrder
			.map((pKey) => tmpEntities[pKey] && tmpEntities[pKey].Entity)
			.filter(Boolean);
		const tmpIndexByEntity = {};
		tmpEntityNames.forEach((pName, pIndex) => { tmpIndexByEntity[pName] = pIndex; });

		const tmpWarnings = [];
		tmpOrder.forEach((pKey, pIndex) =>
		{
			const tmpEntityMapping = tmpEntities[pKey];
			if (!tmpEntityMapping || !tmpEntityMapping.Mappings) { return; }
			const tmpGUIDName = tmpEntityMapping.GUIDName || `GUID${tmpEntityMapping.Entity}`;
			Object.keys(tmpEntityMapping.Mappings).forEach((pFieldName) =>
			{
				if (pFieldName === tmpGUIDName) { return; }                 // the entity's own GUID, not an FK
				if (pFieldName.indexOf('GUID') !== 0) { return; }            // only GUID<Other> fields are FKs
				const tmpReferenced = pFieldName.slice(4);
				if (!tmpReferenced || tmpReferenced === tmpEntityMapping.Entity) { return; }
				if (!(tmpReferenced in tmpIndexByEntity)) { return; }        // references something outside this import — fine
				if (tmpIndexByEntity[tmpReferenced] >= pIndex)
				{
					tmpWarnings.push({
						Entity: tmpEntityMapping.Entity,
						Field: pFieldName,
						ReferencedEntity: tmpReferenced,
						Message: `"${tmpEntityMapping.Entity}.${pFieldName}" references "${tmpReferenced}", which is generated after it — reorder so "${tmpReferenced}" comes first, or its foreign key will be unresolved.`,
					});
				}
			});
		});
		return tmpWarnings;
	}
}

module.exports = DataImportComprehensionBuilder;
