// Petits graphiques SVG sans dépendance externe.
const CHART_COLORS = ['#1f9d4d', '#e5851f', '#3b6fe0', '#d0342c', '#7c5fd0', '#0e93a8', '#c23a7a', '#5c8a2f', '#b8862b', '#4a5568'];

function drawBarChart(svgId, items, labelKey, valueKey, { unit = '' } = {}) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const width = svg.clientWidth || 460;
  const rowH = 30;
  const height = Math.max(120, items.length * rowH + 20);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('height', height);
  svg.innerHTML = '';
  if (!items || items.length === 0) {
    svg.innerHTML = `<text x="6" y="22" fill="#6d786f" font-size="13">Aucune donnée</text>`;
    return;
  }
  const max = Math.max(...items.map((i) => Number(i[valueKey]) || 0), 1);
  const labelW = 150;
  const chartW = width - labelW - 60;
  items.forEach((item, idx) => {
    const y = 10 + idx * rowH;
    const val = Number(item[valueKey]) || 0;
    const barW = (val / max) * chartW;
    const raw = String(item[labelKey] ?? '');
    const label = raw.length > 22 ? raw.slice(0, 21) + '…' : raw;
    const shown = unit === 'min' ? fmtDuree(val) : (Math.round(val * 10) / 10) + (unit ? ' ' + unit : '');
    svg.innerHTML += `
      <text x="0" y="${y + 15}" font-size="12" fill="#3a463c">${escapeHtml(label)}</text>
      <rect x="${labelW}" y="${y + 4}" width="${Math.max(barW, 2)}" height="18" rx="4" fill="${CHART_COLORS[idx % CHART_COLORS.length]}"></rect>
      <text x="${labelW + Math.max(barW, 2) + 8}" y="${y + 17}" font-size="12" fill="#1c231d" font-weight="700">${escapeHtml(shown)}</text>`;
  });
}

function drawDonut(svgId, items, labelKey, valueKey, colorMap) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const size = 180;
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.innerHTML = '';
  const total = items.reduce((a, b) => a + (Number(b[valueKey]) || 0), 0);
  const cx = size / 2, cy = size / 2, rO = 78, rI = 50;
  if (!items || items.length === 0 || total === 0) {
    svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${rO}" fill="none" stroke="#e4e9e1" stroke-width="${rO - rI}"/>
      <text x="${cx}" y="${cy}" font-size="13" fill="#6d786f" text-anchor="middle">Aucune donnée</text>`;
    return;
  }
  let a0 = -Math.PI / 2;
  items.forEach((item, idx) => {
    const frac = (Number(item[valueKey]) || 0) / total;
    const a1 = a0 + frac * Math.PI * 2;
    const color = (colorMap && colorMap[item[labelKey]]) || CHART_COLORS[idx % CHART_COLORS.length];
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x1 = cx + rO * Math.cos(a0), y1 = cy + rO * Math.sin(a0);
    const x2 = cx + rO * Math.cos(a1), y2 = cy + rO * Math.sin(a1);
    const xi1 = cx + rI * Math.cos(a1), yi1 = cy + rI * Math.sin(a1);
    const xi2 = cx + rI * Math.cos(a0), yi2 = cy + rI * Math.sin(a0);
    svg.innerHTML += `<path d="M ${x1} ${y1} A ${rO} ${rO} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${rI} ${rI} 0 ${large} 0 ${xi2} ${yi2} Z" fill="${color}"></path>`;
    a0 = a1;
  });
  svg.innerHTML += `<text x="${cx}" y="${cy - 3}" font-size="22" font-weight="800" fill="#1c231d" text-anchor="middle">${total}</text>
    <text x="${cx}" y="${cy + 14}" font-size="10" fill="#6d786f" text-anchor="middle">au total</text>`;
}

function renderLegend(elId, items, labelKey, valueKey, colorMap) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = items.map((item, idx) => {
    const color = (colorMap && colorMap[item[labelKey]]) || CHART_COLORS[idx % CHART_COLORS.length];
    return `<div class="legend-row"><span class="legend-swatch" style="background:${color}"></span>
      <span class="legend-label">${escapeHtml(item[labelKey])}</span><span class="legend-count">${item[valueKey]}</span></div>`;
  }).join('') || '<div class="muted">Aucune donnée</div>';
}
