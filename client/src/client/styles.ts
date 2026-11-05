/** 面板样式：全部走 DSH 设计令牌，跟随明暗主题。 */

export const CSS = `
.skm-section{max-width:820px;min-width:0;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary)}
.skm-head{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}
.skm-head__text{flex:1 1 320px;min-width:0}
.skm-title{margin:0;font-size:16px;line-height:24px;font-weight:600}
.skm-sub{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.skm-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.skm-btn{box-sizing:border-box;height:28px;padding:0 10px;display:inline-flex;align-items:center;gap:6px;border:.5px solid var(--dsw-alias-border-l3);border-radius:14px;background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1;white-space:nowrap;cursor:pointer}
.skm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.skm-btn:disabled{color:var(--dsw-alias-label-quaternary);border-color:var(--dsw-alias-border-l4);cursor:default}
.skm-btn--primary{height:30px;padding:0 14px;border-radius:15px;border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.skm-btn--primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.skm-btn--primary:disabled{background:var(--dsw-alias-button-primary-dimmed);color:var(--dsw-alias-label-quaternary)}
.skm-btn--danger{color:var(--dsw-alias-state-error-primary)}
.skm-btn--danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}
.skm-btn--ghost{border-color:transparent}
.skm-search{box-sizing:border-box;flex:1 1 220px;min-width:160px;height:30px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l3);border-radius:15px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.skm-search:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.skm-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.skm-chip{box-sizing:border-box;height:26px;padding:0 10px;display:inline-flex;align-items:center;gap:6px;border:.5px solid var(--dsw-alias-border-l3);border-radius:13px;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;white-space:nowrap;cursor:pointer}
.skm-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.skm-chip--active{border-color:transparent;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-weight:600}
.skm-chip__count{color:var(--dsw-alias-label-quaternary);font-size:11px}
.skm-list{display:flex;flex-direction:column;gap:8px;min-width:0}
.skm-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:14px;min-width:0}
.skm-row--off{opacity:.64}
.skm-row__main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.skm-name{font-size:14px;line-height:20px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--ds-font-family-code,ui-monospace,monospace)}
.skm-desc{font-size:12px;line-height:17px;color:var(--dsw-alias-label-tertiary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.skm-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}
.skm-tag{padding:0 6px;border:.5px solid var(--dsw-alias-border-l3);border-radius:4px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code,ui-monospace,monospace)}
.skm-tag--cat{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.skm-tag--warn{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.skm-row__side{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.skm-switch{position:relative;flex:0 0 auto;width:34px;height:19px;padding:0;border:0;border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer}
.skm-switch--on{background:var(--dsw-alias-label-primary)}
.skm-switch:disabled{opacity:.5;cursor:default}
.skm-switch__knob{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:left .15s ease}
.skm-switch--on .skm-switch__knob{left:17px}
.skm-card{display:flex;flex-direction:column;gap:12px;padding:14px;border:.5px solid var(--dsw-alias-border-l3);border-radius:16px;background:var(--dsw-alias-bg-module-platform)}
.skm-card__title{margin:0;font-size:14px;line-height:20px;font-weight:600}
.skm-field{display:flex;flex-direction:column;gap:6px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);min-width:0}
.skm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.skm-input,.skm-textarea{box-sizing:border-box;width:100%;border:.5px solid var(--dsw-alias-border-l3);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.skm-input{height:32px;padding:0 10px}
.skm-textarea{min-height:220px;padding:10px;resize:vertical;font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px;line-height:18px}
.skm-input:focus,.skm-textarea:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.skm-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.skm-notice{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.skm-notice--error{color:var(--dsw-alias-state-error-primary)}
.skm-empty{margin:0;padding:16px;border:.5px dashed var(--dsw-alias-border-l3);border-radius:14px;text-align:center;font-size:13px;color:var(--dsw-alias-label-quaternary)}
.skm-cats{display:flex;flex-direction:column;gap:8px}
.skm-cat{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:12px}
.skm-cat__name{font-size:13px;font-weight:500}
.skm-cat__meta{font-size:11px;color:var(--dsw-alias-label-quaternary)}
.skm-spacer{flex:1 1 auto}
`
