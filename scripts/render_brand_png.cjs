// Gera os PNGs da marca (ícones, splash, lojas) a partir de public/brand/*.svg.
// Uso: node scripts/render_brand_png.cjs   (requer Playwright com Chromium)
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const brand = (f) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(ROOT, 'public/brand', f)).toString('base64')

const OFF_BG = 'radial-gradient(75% 75% at 50% 38%, #FCF8F1 0%, #F2EBDD 70%, #E7DAC2 100%)'
const NAVY_BG = 'radial-gradient(80% 90% at 50% 30%, #15405A 0%, #0B2A3C 60%, #071B27 100%)'

const jobs = [
  // Capacitor assets (ícone adaptativo Android + iOS + splash)
  { out: 'assets/icon-only.png', w: 1024, h: 1024, img: 'icon.svg', fill: true },
  { out: 'assets/icon-foreground.png', w: 1024, h: 1024, img: 'icon-foreground.svg', fill: true, transparent: true },
  { out: 'assets/icon-background.png', w: 1024, h: 1024, bg: OFF_BG },
  { out: 'assets/splash.png', w: 2732, h: 2732, bg: '#F2EBDD', img: 'logo-horizontal.svg', width: 1100 },
  { out: 'assets/splash-dark.png', w: 2732, h: 2732, bg: '#071B27', img: 'logo-horizontal-dark.svg', width: 1100 },
  // Lojas
  { out: 'store/play-store-icon-512.png', w: 512, h: 512, img: 'icon.svg', fill: true },
  { out: 'store/app-store-icon-1024.png', w: 1024, h: 1024, img: 'icon.svg', fill: true },
  { out: 'store/play-store-feature-1024x500.png', w: 1024, h: 500, bg: NAVY_BG, img: 'logo-horizontal-dark.svg', width: 620 },
  // Web
  { out: 'public/brand/apple-touch-icon.png', w: 180, h: 180, img: 'icon.svg', fill: true },
  { out: 'public/brand/icon-192.png', w: 192, h: 192, img: 'icon.svg', fill: true },
]

;(async () => {
  const b = await chromium.launch()
  for (const j of jobs) {
    const p = await b.newPage({ viewport: { width: j.w, height: j.h } })
    const img = j.img
      ? `<img src="${brand(j.img)}" style="${j.fill ? 'width:100%;height:100%' : `width:${j.width}px`};display:block">`
      : ''
    await p.setContent(`<body style="margin:0;width:${j.w}px;height:${j.h}px;display:grid;place-items:center;
      background:${j.transparent ? 'transparent' : j.bg || 'transparent'}">${img}</body>`)
    await p.waitForTimeout(150)
    await p.screenshot({ path: path.join(ROOT, j.out), omitBackground: !!j.transparent })
    await p.close()
    console.log('✓', j.out)
  }
  await b.close()
})()
