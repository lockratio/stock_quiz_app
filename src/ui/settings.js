// settings.js — appearance, quiz behaviour, and data (export/import/reset,
// data-source override, and the honest cross-device sync caveat).

import { $, el } from '../lib/dom.js';
import { store } from '../state/store.js';

const ACCENTS = ['#7C5CFF', '#0EA5E9', '#12B886', '#F43F5E', '#F59E0B', '#EC4899', '#191527'];
const on = b => b ? ' on' : '';

export function renderSettings(app) {
  const s = store.settings;
  const sec = $('#settings');
  sec.innerHTML = `
    <div class="eyebrow">personalise</div>
    <h1 class="h-title" style="margin:4px 0 16px">Settings</h1>

    <div class="set-group">
      <div class="gh">Appearance</div>
      <div class="set-row"><div class="l"><div class="t">Accent colour</div><div class="d">Retints the whole app</div></div></div>
      <div class="swatches" id="swatches" style="margin:-3px 2px 12px">
        ${ACCENTS.map(h => `<div class="sw${h === s.accent ? ' on' : ''}" style="background:${h}" data-hex="${h}"></div>`).join('')}
      </div>
      <div class="set-row"><div class="l"><div class="t">Typeface</div></div>
        <div class="seg" id="fontSeg" style="max-width:230px">
          <button data-f="rounded"${on(s.font === 'rounded')}>Aa</button>
          <button data-f="sans"${on(s.font === 'sans')}>Aa</button>
          <button data-f="serif"${on(s.font === 'serif')} style="font-family:Georgia,serif">Aa</button>
          <button data-f="mono"${on(s.font === 'mono')} style="font-family:var(--mono)">Aa</button>
        </div>
      </div>
      <div class="slider-row"><div class="top"><span class="t">Text size</span><span class="v" id="fsVal">${s.fontScale}%</span></div>
        <input type="range" min="85" max="130" value="${s.fontScale}" oninput="app.setFontScale(this.value)"></div>
    </div>

    <div class="set-group">
      <div class="gh">Quiz behaviour</div>
      <div class="toggle-row"><div><div class="t">Sound effects</div><div class="d">Little chimes on correct / wrong</div></div><div class="toggle${on(s.sound)}" data-set="sound" onclick="app.tgl(this)"><i></i></div></div>
      <div class="toggle-row"><div><div class="t">Haptic-style feedback</div><div class="d">Visual pulse + vibrate on tap</div></div><div class="toggle${on(s.haptic)}" data-set="haptic" onclick="app.tgl(this)"><i></i></div></div>
      <div class="slider-row"><div class="top"><span class="t">Fuzzy match threshold</span><span class="v" id="thVal">${s.fuzzyThreshold}%</span></div>
        <input type="range" min="70" max="100" value="${s.fuzzyThreshold}" oninput="app.setFuzzy(this.value)"></div>
    </div>

    <div class="set-group">
      <div class="gh">Data</div>
      <div class="flag"><b>Heads up · sync</b>Progress lives in THIS browser only (localStorage). Phone ↔ desktop don't sync. Use Export / Import below to move stats between devices.</div>
      <div class="set-row"><div class="l" style="flex:1"><div class="t">Data source URL</div><div class="d">Blank = this repo's /data. Paste a raw base URL to override.</div>
        <input id="dataUrl" placeholder="https://raw.githubusercontent.com/…/data/" value="${s.dataBaseUrl || ''}"
          style="width:100%;margin-top:8px;border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-family:inherit;font-size:13px;background:var(--surface-2)"></div></div>
      <button class="set-btn" onclick="app.exportStats()">Export stats (JSON) <span>↓</span></button>
      <button class="set-btn" onclick="app.importStats()">Import stats (JSON) <span>↑</span></button>
      <button class="set-btn" onclick="app.reloadData()">Reload data <span>↻</span></button>
      <button class="set-btn danger" onclick="app.resetAll()">Clear all progress</button>
    </div>`;

  $('#swatches').querySelectorAll('.sw').forEach(sw => sw.onclick = () => app.setAccent(sw.dataset.hex));
  $('#fontSeg').querySelectorAll('button').forEach(b => b.onclick = () => app.setFont(b.dataset.f));
  const url = $('#dataUrl');
  url.onchange = () => { store.saveSettings({ dataBaseUrl: url.value.trim() }); };
}
