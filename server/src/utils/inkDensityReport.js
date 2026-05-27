/**
 * Ink Density HTML Report Generator
 * Port of xrite-export/src/export/report.rs → Node.js.
 * Generates print-ready A4 portrait HTML.
 */

// ── Dot-gain target table ─────────────────────────────────────────────────────

const DOT_GAIN_TARGETS = [
  [0.4, 1.0], [0.8, 2.0], [1.0, 3.0], [3.0, 9.0], [5.0, 13.0],
  [10.0, 22.0], [20.0, 37.0], [30.0, 51.0], [40.0, 62.0], [50.0, 72.0],
  [60.0, 81.0], [70.0, 88.0], [80.0, 93.0], [90.0, 97.0],
  [95.0, 99.0], [100.0, 100.0]
]

function interpolateTarget(step) {
  const s = parseFloat(step)
  if (isNaN(s)) return null
  if (s < DOT_GAIN_TARGETS[0][0] || s > DOT_GAIN_TARGETS.at(-1)[0]) return null
  for (const [s0, t0] of DOT_GAIN_TARGETS) {
    if (Math.abs(s0 - s) < 1e-10) return t0
  }
  for (let i = 0; i < DOT_GAIN_TARGETS.length - 1; i++) {
    const [s0, t0] = DOT_GAIN_TARGETS[i]
    const [s1, t1] = DOT_GAIN_TARGETS[i + 1]
    if (s >= s0 && s <= s1) {
      const ratio = (s - s0) / (s1 - s0)
      return t0 + ratio * (t1 - t0)
    }
  }
  return null
}

// ── Ink helpers ───────────────────────────────────────────────────────────────

const CMYK_KINDS = new Set(['cyan', 'magenta', 'yellow', 'black'])

function inkClass(kind) {
  return { cyan: 'ink-c', magenta: 'ink-m', yellow: 'ink-y', black: 'ink-k', white: 'ink-w', spot: 'ink-spot' }[kind] || 'ink-spot'
}

function deviationInkIndices(inks) {
  return inks.reduce((acc, ink, i) => { if (CMYK_KINDS.has(ink.kind)) acc.push(i); return acc }, [])
}

function pantoneHex(name) {
  let s = name.trim()
  for (const pfx of ['Pantone® ', 'Pantone ', 'PMS ', 'pms ']) {
    if (s.startsWith(pfx)) { s = s.slice(pfx.length); break }
  }
  for (const sfx of [' CP', ' UP', ' C', ' U']) {
    if (s.endsWith(sfx)) { s = s.slice(0, -sfx.length); break }
  }
  s = s.trim()
  return PANTONE[s] || null
}

function isLight(hex) {
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b > 140
}

function inkHeaderStyle(kind, name) {
  if (kind !== 'spot') return ''
  const hex = pantoneHex(name)
  if (!hex) return ''
  const fg = isLight(hex) ? '#1a1a1a' : '#ffffff'
  return ` style="background-color:#${hex};color:${fg};"`
}

// ── Formatters ────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function fmtVal(v, dp) {
  if (v === 0 || v == null) return ''
  return v.toFixed(dp)
}

function jobHeading(job) {
  const specParts = [job.plate_tech, job.press_system, job.esxr_number].filter(Boolean).join(' ')
  return [job.customer, specParts, job.print_type].filter(Boolean).join(' — ')
}

function shapeDisplayName(shape) {
  return shape.dot_number ? `${shape.dot_type} ${shape.dot_number}` : shape.dot_type
}

// ── Header ────────────────────────────────────────────────────────────────────

function buildHeader(job) {
  const customerH = job.customer ? `<div class="customer">${esc(job.customer)}</div>` : ''
  const jobNameH  = job.job_name  ? `<div class="job-name">${esc(job.job_name)}</div>` : ''

  const specTags = [job.plate_tech, job.press_system, job.esxr_number, job.print_type]
    .filter(Boolean)
    .map(s => `<span class="spec-tag">${esc(s)}</span>`)
    .join(' ')
  const specsH = specTags ? `<div class="spec-line">${specTags}</div>` : ''

  const rightItems = [
    ['JOB', job.job_number], ['DATE', job.date], ['SET', job.set_number]
  ]
    .filter(([, v]) => v)
    .map(([lbl, val]) =>
      `<div class="detail-item"><span class="detail-label">${lbl}</span><span class="detail-value">${esc(val)}</span></div>`
    ).join('')
  const rightH = rightItems ? `<div class="header-right">${rightItems}</div>` : ''

  return `<header class="report-header"><div class="accent-bar"></div><div class="header-inner"><div class="header-left">${customerH}${jobNameH}${specsH}</div>${rightH}</div></header>`
}

// ── Shape table ───────────────────────────────────────────────────────────────

function buildShapeTable(job, shape) {
  if (!shape.weights?.length) return '<p class="empty-note">No LPI data.</p>'

  const numInks    = job.inks.length
  const devIndices = deviationInkIndices(job.inks)
  const showAvgDev = devIndices.length > 0
  const colsPerLpi = numInks + (showAvgDev ? 2 : 0)
  const numLpis    = shape.weights.length

  let h = '<table class="data-table"><thead>'

  // Row 1: Step | LPI group labels | Target
  h += '<tr>'
  h += '<th rowspan="2" class="th-corner">Step</th>'
  shape.weights.forEach((w, wi) => {
    const extra = wi < numLpis - 1 ? ' lpi-last' : ''
    h += `<th colspan="${colsPerLpi}" class="th-lpi-group${extra}">${esc(w.lpi)}</th>`
  })
  h += '<th rowspan="2" class="th-target">Target</th></tr>'

  // Row 2: Ink name headers
  h += '<tr>'
  shape.weights.forEach((_, wi) => {
    const lastLpi = wi === numLpis - 1
    job.inks.forEach((ink, ci) => {
      const lastInk = ci === numInks - 1 && !showAvgDev
      const boundary = !lastLpi && lastInk ? ' lpi-last' : ''
      const cls = inkClass(ink.kind)
      const style = inkHeaderStyle(ink.kind, ink.name)
      h += `<th class="th-ink ${cls}${boundary}"${style}>${esc(ink.name)}</th>`
    })
    if (showAvgDev) {
      const b = !lastLpi ? ' lpi-last' : ''
      h += '<th class="th-avg">Avg</th>'
      h += `<th class="th-dev${b}">Dev</th>`
    }
  })
  h += '</tr></thead><tbody>'

  // Density row
  h += '<tr class="row-density"><td class="td-step">D</td>'
  shape.weights.forEach((w, wi) => {
    const lastLpi = wi === numLpis - 1
    job.inks.forEach((_, ci) => {
      const lastInk = ci === numInks - 1 && !showAvgDev
      const b = !lastLpi && lastInk ? ' lpi-last' : ''
      const v = w.density?.[ci] ?? 0
      h += `<td class="td-data${b}">${fmtVal(v, 2)}</td>`
    })
    if (showAvgDev) {
      const b = !lastLpi ? ' lpi-last' : ''
      h += '<td class="td-avg"></td>'
      h += `<td class="td-dev${b}"></td>`
    }
  })
  h += '<td class="td-target"></td></tr>'

  // Step rows
  job.step_labels.forEach((label, si) => {
    h += '<tr>'
    h += `<td class="td-step">${esc(label)}%</td>`
    const isHundred = label === '100'

    shape.weights.forEach((w, wi) => {
      const lastLpi = wi === numLpis - 1
      const rowValues = isHundred
        ? new Array(numInks).fill(100)
        : (w.steps?.[si] ? [...w.steps[si]] : []).concat(new Array(numInks).fill(0)).slice(0, numInks)

      job.inks.forEach((_, ci) => {
        const lastInk = ci === numInks - 1 && !showAvgDev
        const b = !lastLpi && lastInk ? ' lpi-last' : ''
        h += `<td class="td-data${b}">${fmtVal(rowValues[ci] ?? 0, 1)}</td>`
      })

      if (showAvgDev) {
        const b = !lastLpi ? ' lpi-last' : ''
        const sum = devIndices.reduce((acc, i) => acc + (rowValues[i] ?? 0), 0)
        const avg = sum / devIndices.length
        h += `<td class="td-avg">${fmtVal(avg, 1)}</td>`

        const target = interpolateTarget(label)
        let devStr = ''
        if (target !== null) {
          const d = avg - target
          devStr = Math.abs(d) < 0.05 ? '0' : (d >= 0 ? '+' : '') + d.toFixed(1)
        }
        h += `<td class="td-dev${b}">${devStr}</td>`
      }
    })

    const target = interpolateTarget(label)
    h += `<td class="td-target">${target !== null ? target.toFixed(1) : ''}</td>`
    h += '</tr>'
  })

  h += '</tbody></table>'
  return h
}

function buildShapeSection(job, shape) {
  const name  = shapeDisplayName(shape)
  const table = buildShapeTable(job, shape)
  return `<section class="shape-section">
<div class="shape-heading"><span class="shape-label">${esc(name)}</span></div>
${table}
</section>`
}

function buildBody(job) {
  if (!job.shapes?.length) return '<p class="empty-note">No data recorded.</p>'
  return job.shapes.map(s => buildShapeSection(job, s)).join('\n')
}

// ── Single-job report ─────────────────────────────────────────────────────────

export function generateReport(job) {
  const heading = jobHeading(job)
  const title   = heading || 'Ink Density Report'
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="no-print">
  <button onclick="window.print()">Print / Save PDF</button>
  <button onclick="window.close()">Close</button>
</div>
${buildHeader(job)}
${buildBody(job)}
</body>
</html>`
}

// ── Comparison (multi-job) report ─────────────────────────────────────────────

export function generateComparisonReport(jobs) {
  if (!jobs.length) return '<html><body><p>No jobs provided.</p></body></html>'
  const first = jobs[0]

  const allSame = (fn) => {
    const v = fn(first)
    return v && jobs.every(j => fn(j) === v)
  }

  const s = {
    customer:   allSame(j => j.customer),
    job_name:   allSame(j => j.job_name),
    plate_tech: allSame(j => j.plate_tech),
    esxr:       allSame(j => j.esxr_number),
    press:      allSame(j => j.press_system),
    print_type: allSame(j => j.print_type),
    date:       allSame(j => j.date),
    set:        allSame(j => j.set_number),
    inks:       (() => {
      const k = (j) => (j.inks || []).map(i => i.name).join(',')
      const v = k(first); return v && jobs.every(j => k(j) === v)
    })(),
    shapes:     (() => {
      const k = (j) => (j.shapes || []).map(shapeDisplayName).join('|')
      const v = k(first); return v && jobs.every(j => k(j) === v)
    })()
  }

  const customerH = s.customer  ? `<div class="customer">${esc(first.customer)}</div>` : ''
  const jobNameH  = s.job_name  ? `<div class="job-name">${esc(first.job_name)}</div>` : ''

  const specParts = []
  if (s.plate_tech && first.plate_tech) specParts.push(`<span class="spec-tag">${esc(first.plate_tech)}</span>`)
  if (s.esxr       && first.esxr_number) specParts.push(`<span class="spec-tag">${esc(first.esxr_number)}</span>`)
  if (s.press      && first.press_system) specParts.push(`<span class="spec-tag">${esc(first.press_system)}</span>`)
  if (s.print_type && first.print_type) specParts.push(`<span class="spec-tag">${esc(first.print_type)}</span>`)
  if (s.shapes) (first.shapes || []).forEach(sh => specParts.push(`<span class="spec-tag">${esc(shapeDisplayName(sh))}</span>`))
  const sharedSpecs = specParts.length ? `<div class="spec-line">${specParts.join(' ')}</div>` : ''

  const infoParts = []
  if (s.date && first.date) infoParts.push(`<span><b>Date</b> ${esc(first.date)}</span>`)
  if (s.set  && first.set_number) infoParts.push(`<span><b>Set</b> ${esc(first.set_number)}</span>`)
  if (s.inks) infoParts.push(`<span><b>Inks</b> ${esc((first.inks || []).map(i => i.name).join(' '))}</span>`)
  const infoRow = infoParts.length ? `<div class="banner-info-row">${infoParts.join('')}</div>` : ''

  const sharedBanner = (customerH || jobNameH || sharedSpecs || infoRow)
    ? `<header class="report-header shared-banner"><div class="accent-bar"></div><div class="header-inner">${customerH}${jobNameH}${sharedSpecs}${infoRow}</div></header>`
    : ''

  const jobSections = jobs.map(job => {
    const namePart = !s.job_name && job.job_name ? `<span>${esc(job.job_name)}</span>` : ''
    const numPart  = job.job_number ? `<span class="job-bar-num">#${esc(job.job_number)}</span>` : ''

    const uniqueSpecs = [
      !s.plate_tech ? job.plate_tech : '',
      !s.esxr       ? job.esxr_number : '',
      !s.press      ? job.press_system : '',
      !s.print_type ? job.print_type : ''
    ].filter(Boolean).map(v => `<span class="job-bar-num">${esc(v)}</span>`).join(' ')

    const rightParts = []
    if (!s.customer   && job.customer)    rightParts.push(`<span><b>${esc(job.customer)}</b></span>`)
    if (!s.date       && job.date)        rightParts.push(`<span><b>Date</b> ${esc(job.date)}</span>`)
    if (!s.set        && job.set_number)  rightParts.push(`<span><b>Set</b> ${esc(job.set_number)}</span>`)
    if (!s.inks)                          rightParts.push(`<span><b>Inks</b> ${esc((job.inks||[]).map(i=>i.name).join(' '))}</span>`)
    const rightH = rightParts.length ? `<div class="job-bar-right">${rightParts.join('')}</div>` : ''

    const bar = (namePart || numPart || uniqueSpecs || rightH)
      ? `<div class="job-bar"><div class="job-bar-left">${namePart}${numPart}${uniqueSpecs}</div>${rightH}</div>`
      : ''

    const body = s.shapes ? buildBodyNoHeadings(job) : buildBody(job)
    return `<div class="job-section">${bar}${body}</div>`
  }).join('\n')

  const title = `Combined Report (${jobs.length} jobs)`
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body class="combined">
<div class="no-print">
  <button onclick="window.print()">Print / Save PDF</button>
  <button onclick="window.close()">Close</button>
</div>
${sharedBanner}
${jobSections}
</body>
</html>`
}

function buildBodyNoHeadings(job) {
  if (!job.shapes?.length) return '<p class="empty-note">No data recorded.</p>'
  return job.shapes.map(s =>
    `<section class="shape-section">${buildShapeTable(job, s)}</section>`
  ).join('\n')
}

// ── Pantone catalogue ─────────────────────────────────────────────────────────

const PANTONE = {
  // Yellows
  '100':'F4ED7C','101':'F4ED47','102':'F9E526','103':'C6AD0F','104':'A99200','105':'897A0B',
  '106':'F6E619','107':'F5E012','108':'F4D900','109':'F2CC00','110':'E0B800','111':'C8A400',
  '112':'B59500','113':'F5E642','114':'F5E13C','115':'F5DC3C','116':'FFCD00','117':'D89A00',
  '118':'B88200','119':'8C6400',
  // Orange
  '120':'FAE171','121':'FAD95A','122':'FAD048','123':'FFC72C','124':'EAA900','125':'C48C00',
  '130':'F5A800','131':'D48900','144':'F08300','151':'FA7A14','152':'D96D00','158':'FA6816',
  '165':'FF6900','172':'F25C28','179':'EF3A20','185':'EF3340','186':'CF2A2A','192':'F02057',
  '199':'EF2060','206':'EE1163','213':'E8006B','219':'E050A0','226':'DE008C','233':'D200A0',
  '240':'D428A0','246':'D500A0','253':'CC44B0','258':'B86AB8','265':'AC7EC0','273':'7050A0',
  '280':'1B3A8A','281':'1B327A','286':'0033A0','287':'003087','293':'0065BD','300':'0057A8',
  '306':'50C0ED','312':'00B0D8','320':'009B9E','327':'009490','333':'00B4A8','340':'00A880',
  '347':'00843D','354':'00A85A','361':'78CA40','368':'78BE20','375':'97D700','382':'B4CC00',
  '389':'CCD800','396':'DCE800','485':'DA291C',
  // Greys
  'Cool Gray 1':'E0DDD8','Cool Gray 2':'D4D2CC','Cool Gray 3':'C4C2BC','Cool Gray 4':'B4B2AC',
  'Cool Gray 5':'A8A6A0','Cool Gray 6':'989690','Cool Gray 7':'888884','Cool Gray 8':'747472',
  'Cool Gray 9':'626060','Cool Gray 10':'4A4848','Cool Gray 11':'383636',
  'CG 1':'E0DDD8','CG 2':'D4D2CC','CG 3':'C4C2BC','CG 4':'B4B2AC','CG 5':'A8A6A0',
  'CG 6':'989690','CG 7':'888884','CG 8':'747472','CG 9':'626060','CG 10':'4A4848','CG 11':'383636',
  'Warm Gray 1':'D8D0C8','Warm Gray 2':'CCC4BC','Warm Gray 3':'BCB4AC','Warm Gray 4':'ACA49C',
  'Warm Gray 5':'9C9488','Warm Gray 6':'8C8478','Warm Gray 7':'7C7468','Warm Gray 8':'6C6458',
  'Warm Gray 9':'5C5448','Warm Gray 10':'4C4440','Warm Gray 11':'3C3430',
  'WG 1':'D8D0C8','WG 2':'CCC4BC','WG 3':'BCB4AC','WG 4':'ACA49C','WG 5':'9C9488',
  'WG 6':'8C8478','WG 7':'7C7468','WG 8':'6C6458','WG 9':'5C5448','WG 10':'4C4440','WG 11':'3C3430',
  // Special
  '021':'FE5000','032':'EF3340','072':'003DA5',
  'Yellow':'FEDD00','Warm Red':'F3432C','Red 032':'EF3340','Rhodamine Red':'E0457B',
  'Rubine Red':'CA0044','Reflex Blue':'001489','Violet':'440099','Process Blue':'0085CA',
  'Green':'00A651','Black':'231F20',
  // Bright
  '801':'008EAA','802':'6CC24A','803':'FFEF00','804':'FF8200','805':'FF5E57','806':'FF59F8','807':'F52886',
  // Metallics
  '871':'9C8732','872':'8C7828','873':'806E20','874':'9A8430','875':'8A7426','876':'7A641C','877':'8C8C8C'
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 10pt;
  color: #1a1a1a;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

@page { size: A4 portrait; margin: 0; }

.no-print {
  position: fixed; top: 10px; right: 10px; z-index: 100;
  display: flex; gap: 6px;
}
.no-print button {
  padding: 6px 16px;
  background: #1e293b; color: #fff;
  border: none; border-radius: 4px;
  font-size: 12px; cursor: pointer; font-family: inherit;
}
.no-print button:hover { background: #334155; }
@media print { .no-print { display: none !important; } }

.report-header { margin-bottom: 8mm; }
.accent-bar { height: 6px; background: #1e293b; }
.header-inner {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 7mm 17mm 7mm; border-bottom: 1pt solid #1e293b;
}
.header-left { flex: 1; }
.header-right { flex-shrink: 0; padding-left: 12mm; text-align: right; }
.customer { font-size: 20pt; font-weight: 700; color: #1e293b; letter-spacing: -0.4px; line-height: 1.1; margin-bottom: 4pt; }
.job-name { font-size: 11pt; color: #374151; font-weight: 500; margin-bottom: 5pt; }
.spec-line { display: flex; flex-wrap: wrap; gap: 3pt; }
.spec-tag { display: inline-block; background: #f1f5f9; border: 0.5pt solid #cbd5e1; border-radius: 3px; padding: 2pt 6pt; font-size: 8pt; font-weight: 600; color: #475569; letter-spacing: 0.3px; }
.detail-item { margin-bottom: 5pt; line-height: 1.2; }
.detail-label { display: block; font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.6px; color: #9ca3af; margin-bottom: 1pt; }
.detail-value { font-size: 9pt; font-weight: 600; color: #1e293b; }

.shape-section { padding: 0 17mm; margin-bottom: 8mm; page-break-inside: avoid; }
.shape-heading { display: flex; align-items: center; gap: 6pt; margin-bottom: 5pt; }
.shape-heading::after { content: ''; flex: 1; height: 0.5pt; background: #cbd5e1; }
.shape-label { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #1e293b; background: #f1f5f9; border: 0.5pt solid #cbd5e1; border-radius: 3px; padding: 2.5pt 8pt; white-space: nowrap; }
.empty-note { font-size: 8.5pt; color: #9ca3af; font-style: italic; padding: 4pt 17mm; }

.data-table { border-collapse: collapse; font-size: 8.5pt; font-variant-numeric: tabular-nums; }
th { padding: 3.5pt 5pt; text-align: center; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.2px; background: #1e293b; color: #94a3b8; border: 0.5pt solid #334155; white-space: nowrap; }
th.th-corner { text-align: left; padding-left: 5pt; background: #0f172a; color: #64748b; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.5px; }
th.th-target { background: #0f172a; color: #64748b; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.5px; border-left: 1pt solid #475569; }
th.th-lpi-group { background: #263347; color: #cbd5e1; font-size: 8pt; font-weight: 700; letter-spacing: 0.5px; border-bottom: 1.5pt solid #475569; padding: 4pt 5pt; }
th.th-ink { background: #1a2535; font-size: 8pt; font-weight: 700; }
th.ink-c { color: #38bdf8; }
th.ink-m { color: #f472b6; }
th.ink-y { color: #fbbf24; }
th.ink-k { color: #e2e8f0; }
th.ink-w { color: #f1f5f9; }
th.ink-spot { color: #c4b5fd; }
th.th-avg { background: #1a2535; color: #86efac; font-size: 7pt; }
th.th-dev { background: #1a2535; color: #a5b4fc; font-size: 7pt; }
th.lpi-last, td.lpi-last { border-right: 2pt solid #64748b !important; }
td { padding: 2.5pt 5pt; text-align: right; border: 0.5pt solid #e5e7eb; white-space: nowrap; }
td.td-step { text-align: left; padding-left: 5pt; background: #f8fafc !important; color: #374151; font-size: 8pt; font-weight: 500; border-right: 1pt solid #cbd5e1; }
td.td-target { background: #f0f4ff !important; color: #4b5563; font-style: italic; border-left: 1pt solid #c7d2fe; }
td.td-avg { color: #15803d; }
td.td-dev { color: #374151; }
td.td-data { color: #111827; }
tr.row-density td { background: #f1f5f9; }
tr.row-density td.td-step { background: #e2e8f0 !important; font-weight: 700; }
tr.row-density td.td-target { background: #e8edfa !important; }
tr:nth-child(even):not(.row-density) td.td-data { background: #fafafa; }
tr:nth-child(even):not(.row-density) td.td-avg { background: #f0fdf4; }

body.combined .report-header { margin-bottom: 2mm; }
body.combined .accent-bar { height: 4px; }
body.combined .shape-section { padding: 0 12mm; margin-bottom: 3mm; }
body.combined .shared-banner .header-inner { padding: 4mm 12mm 3mm; flex-direction: column; gap: 3pt; align-items: flex-start; }
body.combined .shared-banner .customer { font-size: 14pt; margin-bottom: 1pt; }
body.combined .banner-info-row { font-size: 7.5pt; color: #64748b; display: flex; flex-wrap: wrap; gap: 8pt; margin-top: 2pt; }
body.combined .banner-info-row span b { color: #374151; font-weight: 600; }
body.combined .job-section .accent-bar { display: none; }
body.combined .job-bar { display: flex; align-items: baseline; justify-content: space-between; padding: 2mm 12mm; border-bottom: 0.5pt solid #e2e8f0; }
body.combined .job-bar-left { font-size: 9pt; font-weight: 700; color: #1e293b; display: flex; align-items: baseline; gap: 6pt; }
body.combined .job-bar-num { font-size: 8pt; color: #64748b; font-weight: 500; }
body.combined .job-bar-right { font-size: 7.5pt; color: #64748b; display: flex; gap: 8pt; }
body.combined .job-bar-right span b { color: #374151; font-weight: 600; }
`
