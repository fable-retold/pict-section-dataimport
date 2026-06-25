// Themeable wizard CSS for pict-section-dataimport. Registered once (by hash) by the provider. Covers
// the per-step body content (detect/columns/mapping/preview/push); the wizard chrome itself comes from
// pict-section-accordion, and the dropzone from pict-section-upload. Brand via the --theme-* tokens.

module.exports = /*css*/`
.psd { width: 100%; box-sizing: border-box; font-size: var(--theme-typography-size-md, 0.95rem); color: var(--theme-color-text-primary, #1f2733); }
.psd *, .psd *::before, .psd *::after { box-sizing: border-box; }
.psd-step { display: flex; flex-direction: column; gap: var(--theme-spacing-md, 0.85rem); }
.psd-hint { font-size: var(--theme-typography-size-sm, 0.86rem); color: var(--theme-color-text-muted, #6b7686); margin: 0; }
.psd-section-title { font-size: var(--theme-typography-size-md, 0.95rem); font-weight: var(--theme-typography-weight-bold, 700); margin: 0; }

/* Parse options row (delimiter, has-header, kind) */
.psd-options { display: flex; flex-wrap: wrap; align-items: center; gap: var(--theme-spacing-md, 0.9rem); }
.psd-field { display: flex; align-items: center; gap: 0.4rem; font-size: var(--theme-typography-size-sm, 0.86rem); }
.psd-field label { color: var(--theme-color-text-secondary, #45596b); }
.psd-input, .psd-select { font: inherit; font-size: var(--theme-typography-size-sm, 0.88rem); padding: 0.35rem 0.5rem;
	border: 1px solid var(--theme-color-border-default, #d7dce3); border-radius: var(--theme-radius-md, 6px);
	background: var(--theme-color-background-primary, #fff); color: var(--theme-color-text-primary, #1f2733); }
.psd-input:focus, .psd-select:focus { outline: none; border-color: var(--theme-color-brand-primary, #156dd1);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-color-focus-outline, #156dd1) 22%, transparent); }
.psd-textarea { width: 100%; min-height: 150px; font-family: var(--theme-typography-family-mono, ui-monospace, monospace);
	font-size: var(--theme-typography-size-sm, 0.82rem); padding: 0.6rem 0.7rem; border-radius: var(--theme-radius-md, 6px);
	border: 1px solid var(--theme-color-border-default, #d7dce3); background: var(--theme-color-background-secondary, #f6f7f9);
	color: var(--theme-color-text-primary, #1f2733); resize: vertical; }

/* Tables (detected columns, sample rows, generated-record preview) */
.psd-table-wrap { overflow: auto; border: 1px solid var(--theme-color-border-light, #e8ebf0); border-radius: var(--theme-radius-md, 6px); max-height: 320px; }
.psd-table { border-collapse: collapse; width: 100%; font-size: var(--theme-typography-size-sm, 0.84rem); }
.psd-table th { position: sticky; top: 0; text-align: left; padding: 0.45rem 0.6rem; white-space: nowrap;
	background: var(--theme-color-background-secondary, #f6f7f9); color: var(--theme-color-text-secondary, #45596b);
	border-bottom: 1px solid var(--theme-color-border-default, #d7dce3); font-weight: var(--theme-typography-weight-medium, 600); }
.psd-table td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--theme-color-border-light, #eef1f5);
	color: var(--theme-color-text-primary, #1f2733); white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
.psd-table tr:last-child td { border-bottom: none; }
.psd-type { font-size: var(--theme-typography-size-xs, 0.72rem); color: var(--theme-color-text-muted, #6b7686); font-weight: 400; }
.psd-mono { font-family: var(--theme-typography-family-mono, ui-monospace, monospace); }
.psd-ruler { font-family: var(--theme-typography-family-mono, ui-monospace, monospace); font-size: var(--theme-typography-size-sm, 0.82rem);
	white-space: pre; overflow-x: auto; padding: 0.5rem 0.6rem; background: var(--theme-color-background-secondary, #f6f7f9);
	border: 1px solid var(--theme-color-border-light, #e8ebf0); border-radius: var(--theme-radius-md, 6px); }

/* Mapping editor */
.psd-entity { border: 1px solid var(--theme-color-border-light, #e8ebf0); border-radius: var(--theme-radius-md, 8px); padding: var(--theme-spacing-md, 0.85rem); }
.psd-entity-head { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; margin-bottom: 0.6rem; }
.psd-entity-name { font-weight: var(--theme-typography-weight-bold, 700); }
.psd-entity-count { font-size: var(--theme-typography-size-xs, 0.74rem); color: var(--theme-color-text-muted, #6b7686); }
.psd-map-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; align-items: center; padding: 0.25rem 0; }
.psd-map-field { font-size: var(--theme-typography-size-sm, 0.86rem); }
.psd-map-required { color: var(--theme-color-status-error, #b62828); }

/* Buttons + status */
.psd-btn { cursor: pointer; font: inherit; font-size: var(--theme-typography-size-sm, 0.88rem); font-weight: var(--theme-typography-weight-medium, 600);
	padding: 0.45rem 0.9rem; border-radius: var(--theme-radius-md, 6px); border: none;
	background: var(--theme-color-brand-primary, #156dd1); color: var(--theme-color-background-panel, #fff); display: inline-flex; align-items: center; gap: 0.4rem; }
.psd-btn:hover { background: var(--theme-color-brand-primaryhover, #1257ab); }
.psd-btn-ghost { background: transparent; color: var(--theme-color-brand-primary, #156dd1); border: 1px solid var(--theme-color-border-default, #d7dce3); }
.psd-btn-ghost:hover { background: var(--theme-color-background-hover, #eef1f5); }
.psd-btn:disabled { opacity: 0.5; pointer-events: none; }

.psd-report { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.psd-chip { font-size: var(--theme-typography-size-sm, 0.82rem); padding: 0.25rem 0.6rem; border-radius: var(--theme-radius-pill, 999px);
	background: var(--theme-color-background-tertiary, #eceef2); color: var(--theme-color-text-secondary, #45596b); }
.psd-chip strong { color: var(--theme-color-text-primary, #1f2733); }

.psd-banner { display: flex; align-items: center; gap: 0.45rem; padding: 0.55rem 0.75rem; border-radius: var(--theme-radius-md, 6px); font-size: var(--theme-typography-size-sm, 0.86rem); }
.psd-banner-ok { color: var(--theme-color-status-success, #2e7a3a); background: color-mix(in srgb, var(--theme-color-status-success, #2e7a3a) 12%, transparent); }
.psd-banner-warn { color: var(--theme-color-status-warning, #b8860b); background: color-mix(in srgb, var(--theme-color-status-warning, #d9a406) 14%, transparent); }
.psd-banner-error { color: var(--theme-color-status-error, #b62828); background: color-mix(in srgb, var(--theme-color-status-error, #b62828) 12%, transparent); }
.psd-banner-info { color: var(--theme-color-status-info, #1f6fb5); background: color-mix(in srgb, var(--theme-color-status-info, #1f6fb5) 12%, transparent); }

.psd-progress { height: 8px; border-radius: var(--theme-radius-pill, 999px); overflow: hidden; background: var(--theme-color-background-tertiary, #e9edf2); }
.psd-progress-fill { height: 100%; background: var(--theme-color-brand-primary, #156dd1); transition: width var(--theme-duration-normal, 0.2s) ease; }
.psd-row-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
`;
