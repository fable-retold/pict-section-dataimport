// DataImport-StateStore — the abstract persistence seam, plus built-in memory + localStorage adapters.
//
// This is what lets a user reload a partially-mapped dataset: the wizard serializes its session (file
// ref, parse config, detected columns, the mapping) and save()s it; load()/list() bring it back. A
// host can supply a custom store (or the lighter PersistenceHook on the wizard config) to persist
// sessions on a server instead.

class DataImportStateStore
{
	constructor(pPict, pOptions)
	{
		this.pict = pPict;
		this.options = pOptions || {};
	}

	/** @param {string} pSessionId @param {Record<string, any>} pSerializedSession @return {Promise<void>} */
	save(pSessionId, pSerializedSession) { return Promise.reject(new Error('not implemented')); }
	/** @param {string} pSessionId @return {Promise<Record<string, any>|null>} */
	load(pSessionId) { return Promise.reject(new Error('not implemented')); }
	/** @return {Promise<Array<{SessionId:string, Title:string, UpdatedAt:number}>>} */
	list() { return Promise.reject(new Error('not implemented')); }
	/** @param {string} pSessionId @return {Promise<void>} */
	remove(pSessionId) { return Promise.reject(new Error('not implemented')); }
}

/** Ephemeral in-process store (fine for tests + transient sessions). */
class DataImportStateStoreMemory extends DataImportStateStore
{
	constructor(pPict, pOptions)
	{
		super(pPict, pOptions);
		this._map = {};
	}

	save(pSessionId, pSerializedSession)
	{
		this._map[pSessionId] = JSON.parse(JSON.stringify(pSerializedSession));
		return Promise.resolve();
	}
	load(pSessionId)
	{
		return Promise.resolve(this._map[pSessionId] ? JSON.parse(JSON.stringify(this._map[pSessionId])) : null);
	}
	list()
	{
		return Promise.resolve(Object.keys(this._map).map((pKey) =>
		{
			const tmpSession = this._map[pKey] || {};
			return { SessionId: pKey, Title: tmpSession.Title || pKey, UpdatedAt: tmpSession.UpdatedAt || 0 };
		}));
	}
	remove(pSessionId)
	{
		delete this._map[pSessionId];
		return Promise.resolve();
	}
}

/** Browser localStorage store, keyed by an options.KeyPrefix (default 'dataimport:'). */
class DataImportStateStoreLocal extends DataImportStateStore
{
	get _prefix() { return this.options.KeyPrefix || 'dataimport:'; }

	_storage()
	{
		if (typeof localStorage === 'undefined') { throw new Error('pict-section-dataimport: localStorage is not available in this environment.'); }
		return localStorage;
	}

	save(pSessionId, pSerializedSession)
	{
		try { this._storage().setItem(this._prefix + pSessionId, JSON.stringify(pSerializedSession)); return Promise.resolve(); }
		catch (pError) { return Promise.reject(pError); }
	}
	load(pSessionId)
	{
		try
		{
			const tmpRaw = this._storage().getItem(this._prefix + pSessionId);
			return Promise.resolve(tmpRaw ? JSON.parse(tmpRaw) : null);
		}
		catch (pError) { return Promise.reject(pError); }
	}
	list()
	{
		try
		{
			const tmpStorage = this._storage();
			const tmpSessions = [];
			for (let i = 0; i < tmpStorage.length; i++)
			{
				const tmpKey = tmpStorage.key(i);
				if (tmpKey && tmpKey.indexOf(this._prefix) === 0)
				{
					let tmpSession = {};
					try { tmpSession = JSON.parse(tmpStorage.getItem(tmpKey)) || {}; } catch (pError) { tmpSession = {}; }
					tmpSessions.push({ SessionId: tmpKey.slice(this._prefix.length), Title: tmpSession.Title || tmpKey, UpdatedAt: tmpSession.UpdatedAt || 0 });
				}
			}
			return Promise.resolve(tmpSessions);
		}
		catch (pError) { return Promise.reject(pError); }
	}
	remove(pSessionId)
	{
		try { this._storage().removeItem(this._prefix + pSessionId); return Promise.resolve(); }
		catch (pError) { return Promise.reject(pError); }
	}
}

/** Adapter that wraps a host-supplied PersistenceHook { save, load, list, remove } (e.g. server persistence). */
class DataImportStateStoreHook extends DataImportStateStore
{
	save(pSessionId, pSerializedSession) { return Promise.resolve(this.options.Hook.save(pSessionId, pSerializedSession)); }
	load(pSessionId) { return Promise.resolve(this.options.Hook.load(pSessionId)); }
	list() { return Promise.resolve(this.options.Hook.list ? this.options.Hook.list() : []); }
	remove(pSessionId) { return Promise.resolve(this.options.Hook.remove ? this.options.Hook.remove(pSessionId) : undefined); }
}

module.exports = DataImportStateStore;
module.exports.DataImportStateStoreMemory = DataImportStateStoreMemory;
module.exports.DataImportStateStoreLocal = DataImportStateStoreLocal;
module.exports.DataImportStateStoreHook = DataImportStateStoreHook;
