export function adoptStyles(root: ShadowRoot, css: string): void {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
  } catch {
    const style = document.createElement('style');
    style.textContent = css;
    root.appendChild(style);
  }
}

export const BASE_CSS = `
:host { all: initial; font-family: var(--eu-font); font-size: var(--eu-size); color: var(--eu-fg); line-height: 1.35; }
*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
`;

export const BADGE_CSS = BASE_CSS + `
:host { position: absolute; z-index: 2147483000; pointer-events: none; contain: layout style; }
.pill { pointer-events: auto; display: inline-flex; align-items: center; gap: .5em; max-width: 46vw;
  padding: .28em .7em; border-radius: 999px; background: var(--eu-bg); border: 1px solid var(--eu-border);
  color: var(--eu-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: var(--eu-shadow);
  transition: opacity .15s ease; }
.pill:hover { color: var(--eu-fg); }
.pill .main { overflow: hidden; text-overflow: ellipsis; }
.pill .main b { font-weight: 600; color: var(--eu-fg); }
.pill .why { text-decoration: underline; text-underline-offset: 2px; opacity: .85; }
.pill .shield { font-size: .9em; }
.pill .alt { display: block; font-size: .92em; opacity: .85; }
:host([hidden]) { display: none; }
`;

export const CLOUD_CSS = BASE_CSS + `
:host { position: fixed; z-index: 2147483001; contain: layout style; }
.cloud { background: var(--eu-bg); color: var(--eu-fg); border: 1px solid var(--eu-border); border-radius: var(--eu-radius);
  box-shadow: var(--eu-shadow); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.head h2 { margin: 0; font-size: 1em; font-weight: 600; }
.head .tools { display: flex; gap: 6px; }
.head button { padding: 2px 6px; border-radius: 6px; color: var(--eu-muted); }
.head button:hover { background: var(--eu-faint); color: var(--eu-fg); }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { font-size: .88em; padding: 1px 7px; border-radius: 999px; background: var(--eu-faint); color: var(--eu-muted); }
.warn { font-size: .92em; color: var(--eu-fg); background: var(--eu-faint); padding: 6px 8px; border-radius: 6px; }
table { border-collapse: collapse; width: 100%; font-size: .95em; }
th { text-align: left; font-weight: 500; font-size: .82em; color: var(--eu-muted); padding: 0 0 4px; }
th.fit { padding-right: 8px; }
th.cost { text-align: right; }
td { padding: 4px 0; vertical-align: middle; }
tr.extra { display: none; }
table.all tr.extra { display: table-row; }
td.name em { font-style: normal; font-weight: 400; color: var(--eu-muted); font-size: .85em; }
td.fit .pct { display: block; font-size: .8em; color: var(--eu-muted); margin-top: 2px; font-variant-numeric: tabular-nums; }
button.more { align-self: flex-start; color: var(--eu-muted); text-decoration: underline; text-underline-offset: 2px; font-size: .9em; padding: 0; }
button.more:hover { color: var(--eu-fg); }
td.name { padding-right: 8px; }
td.name small { display: block; color: var(--eu-muted); font-size: .85em; }
tr.win td.name { font-weight: 600; }
td.fit { width: 84px; padding-right: 8px; }
.bar { height: 5px; border-radius: 3px; background: var(--eu-faint); overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--eu-muted); }
td.cost { text-align: right; white-space: nowrap; }
td.cost small { display: block; color: var(--eu-muted); font-size: .85em; }
p { margin: 0; }
p.why { font-size: .95em; }
.else { font-size: .92em; padding-top: 8px; border-top: 1px solid var(--eu-border); }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--eu-muted); font-size: .88em; }
.foot .votes button { padding: 2px 7px; border-radius: 6px; }
.foot .votes button:hover, .foot .votes button[aria-pressed="true"] { background: var(--eu-faint); color: var(--eu-fg); }
:host([collapsed]) .cloud > :not(.head) { display: none; }
:host([hidden]) { display: none; }
`;
