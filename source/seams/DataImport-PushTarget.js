// DataImport-PushTarget — the abstract push seam, plus the built-in Comprehension-POST adapter.
//
// push() takes the generated comprehension + a context (GUID prefixes, server URL, the entity Order,
// an onProgress hook) and lands it somewhere, returning { Success, EntitiesPushed, Message }. The
// POST adapter sends the whole comprehension to a /Comprehension/Push endpoint (the server owns the
// meadow-integration engine) — so this path needs no client-side EntityProvider. The direct
// per-record EntityProvider push adapter lives in Pict-Provider-DataImport-Meadow.js.

class DataImportPushTarget
{
	constructor(pPict, pOptions)
	{
		this.pict = pPict;
		this.options = pOptions || {};
	}

	/**
	 * @param {Record<string, any>} pComprehension @param {Record<string, any>} pContext
	 * @return {Promise<{Success:boolean, EntitiesPushed:Array<string>, Message:string}>}
	 */
	push(pComprehension, pContext)
	{
		return Promise.reject(new Error('pict-section-dataimport: PushTarget does not implement push().'));
	}
}

/**
 * Built-in adapter: POST the whole comprehension to a Comprehension/Push endpoint. The request body
 * matches meadow-integration's Endpoint-ComprehensionPush contract:
 *   { Comprehension, GUIDPrefix, EntityGUIDPrefix, ServerURL } -> { Success, EntitiesPushed, Message }
 * A host can inject a PostFunction (url, body) => Promise<responseJson> for tests / custom transport;
 * otherwise it uses fetch, falling back to the pict EntityProvider rest client.
 */
class DataImportPushTargetComprehension extends DataImportPushTarget
{
	push(pComprehension, pContext)
	{
		const tmpContext = pContext || {};
		const tmpURL = this.options.URL || tmpContext.ComprehensionPushURL || '/1.0/Comprehension/Push';
		const tmpBody = {
			Comprehension: pComprehension,
			GUIDPrefix: tmpContext.GUIDPrefix,
			EntityGUIDPrefix: tmpContext.EntityGUIDPrefix,
			ServerURL: tmpContext.ServerURL,
		};
		const fPost = (typeof this.options.PostFunction === 'function') ? this.options.PostFunction : this._defaultPost.bind(this);
		return Promise.resolve(fPost(tmpURL, tmpBody)).then((pResponse) =>
		{
			const tmpResponse = pResponse || {};
			return {
				Success: (tmpResponse.Success !== undefined) ? tmpResponse.Success : true,
				EntitiesPushed: Array.isArray(tmpResponse.EntitiesPushed) ? tmpResponse.EntitiesPushed : Object.keys(pComprehension || {}),
				Message: tmpResponse.Message || 'Comprehension posted.',
			};
		});
	}

	/** Default JSON POST: fetch when available, else the pict EntityProvider rest client. */
	_defaultPost(pURL, pBody)
	{
		if (typeof fetch === 'function')
		{
			return fetch(pURL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pBody) })
				.then((pResult) => pResult.json());
		}
		if (this.pict && this.pict.EntityProvider && this.pict.EntityProvider.restClient && typeof this.pict.EntityProvider.restClient.postJSON === 'function')
		{
			return new Promise((resolve, reject) =>
			{
				this.pict.EntityProvider.restClient.postJSON({ url: pURL, body: pBody }, (pError, pResponse, pResponseBody) =>
				{
					if (pError) { return reject(pError); }
					resolve(pResponseBody || (pResponse && pResponse.body) || {});
				});
			});
		}
		return Promise.reject(new Error('pict-section-dataimport: no fetch / rest client available to POST the comprehension.'));
	}
}

module.exports = DataImportPushTarget;
module.exports.DataImportPushTargetComprehension = DataImportPushTargetComprehension;
