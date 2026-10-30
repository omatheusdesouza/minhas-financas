"""
Gera a identidade visual do Fynvault em SVG (logo, ícones, logo horizontal).

Uso:  python3 scripts/build_brand.py [--variant cormorant|cinzel|playfair] [--out public/brand]
Requer: pip install fonttools brotli   (as fontes vêm de node_modules/@fontsource)

Todo texto é convertido em contorno vetorial, então os SVGs não dependem
de fontes instaladas no celular.
"""
import argparse
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, 'node_modules', '@fontsource')

NAVY = '#0B2A3C'
GOLD = '#D8B36A'
OFFWHITE = '#F2EBDD'

MONOGRAM_FONTS = {
    'cinzel': ('cinzel/files/cinzel-latin-600-normal.woff2', 'F'),
    'playfair': ('playfair-display/files/playfair-display-latin-700-normal.woff2', 'F'),
    'cormorant': ('cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff2', 'F'),
}
WORDMARK_FONT = 'cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2'
TAGLINE_FONT = 'inter/files/inter-latin-500-normal.woff2'


def _font(rel):
    return TTFont(os.path.join(FONTS, rel))


def glyph_fit(rel, char, x_center, top, height):
    """Contorno de um caractere, escalado para a altura dada e centralizado em x."""
    f = _font(rel)
    gs = f.getGlyphSet()
    g = f.getBestCmap()[ord(char)]
    bp = BoundsPen(gs)
    gs[g].draw(bp)
    xmin, ymin, xmax, ymax = bp.bounds
    s = height / (ymax - ymin)
    dx = x_center - (xmin + xmax) / 2 * s
    dy = top + ymax * s
    pen = SVGPathPen(gs)
    gs[g].draw(TransformPen(pen, (s, 0, 0, -s, dx, dy)))
    return pen.getCommands()


def text_path(rel, text, size, x, baseline, tracking=0.0):
    """Contorno de um texto inteiro; devolve (path, largura)."""
    f = _font(rel)
    upm = f['head'].unitsPerEm
    cmap, gs, hmtx = f.getBestCmap(), f.getGlyphSet(), f['hmtx']
    s = size / upm
    pen = SVGPathPen(gs)
    cx = x
    for ch in text:
        g = cmap[ord(ch)]
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, cx, baseline)))
        cx += hmtx[g][0] * s + tracking
    return pen.getCommands(), cx - tracking - x


DEFS = f'''<defs>
    <linearGradient id="fv-gold" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#F6E3B0"/>
      <stop offset="0.38" stop-color="{GOLD}"/>
      <stop offset="0.72" stop-color="#B08640"/>
      <stop offset="1" stop-color="#E9CD8E"/>
    </linearGradient>
    <linearGradient id="fv-gold-line" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#EBD39A"/>
      <stop offset="0.5" stop-color="{GOLD}"/>
      <stop offset="1" stop-color="#B9904B"/>
    </linearGradient>
    <linearGradient id="fv-navy" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#15405A"/>
      <stop offset="0.55" stop-color="{NAVY}"/>
      <stop offset="1" stop-color="#071E2C"/>
    </linearGradient>
  </defs>'''


def shield(variant, outline=False):
    """Escudo em coordenadas 100..230 (x) e 50..290 (y)."""
    rel, char = MONOGRAM_FONTS[variant]
    f_path = glyph_fit(rel, char, x_center=165, top=106, height=106)
    outer = 'M100 50 L180 50 Q230 50 230 100 L230 180 Q230 250 165 290 Q100 250 100 180 Z'
    inner = 'M124 70 L206 70 Q212 70 212 76 L212 180 Q212 234 165 266 Q118 234 118 180 L118 76 Q118 70 124 70 Z'
    inner2 = 'M127 75 L203 75 Q207 75 207 79 L207 180 Q207 230 165 260 Q123 230 123 180 L123 79 Q123 75 127 75 Z'
    stroke = f' stroke="url(#fv-gold-line)" stroke-width="2.4" stroke-linejoin="round"' if outline else ''
    return f'''<g class="fv-shield">
    <path fill="url(#fv-navy)"{stroke} d="{outer}"/>
    <path fill="none" stroke="url(#fv-gold-line)" stroke-width="1.6" stroke-linejoin="round" d="{inner}"/>
    <path fill="none" stroke="{GOLD}" stroke-width="0.6" opacity="0.45" stroke-linejoin="round" d="{inner2}"/>
    <path fill="url(#fv-gold)" d="M165 63.5 L168 70 L165 76.5 L162 70 Z"/>
    <path fill="url(#fv-gold)" d="{f_path}"/>
    <path fill="none" stroke="url(#fv-gold-line)" stroke-width="0.9" opacity="0.8" stroke-linecap="round" d="M146 232 L184 232"/>
    <path fill="url(#fv-gold)" d="M165 228.5 L168 232 L165 235.5 L162 232 Z"/>
  </g>'''


def logo_svg(variant):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="94 44 142 252">
  {DEFS}
  {shield(variant)}
</svg>
'''


def icon_svg(variant, dark=False):
    """Ícone quadrado 1024: escudo ~66% da altura sobre fundo com luz suave."""
    bg = (f'<radialGradient id="fv-bg" cx="0.5" cy="0.38" r="0.75"><stop offset="0" stop-color="#FCF8F1"/>'
          f'<stop offset="0.7" stop-color="{OFFWHITE}"/><stop offset="1" stop-color="#E7DAC2"/></radialGradient>')
    if dark:
        bg = ('<radialGradient id="fv-bg" cx="0.5" cy="0.35" r="0.8"><stop offset="0" stop-color="#15405A"/>'
              f'<stop offset="1" stop-color="{NAVY}"/></radialGradient>')
    defs = DEFS.replace('<defs>', '<defs>\n    ' + bg + '\n    <filter id="fv-shadow" x="-30%" y="-20%" width="160%" height="150%">'
                        '<feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0B2A3C" flood-opacity="0.28"/></filter>')
    s = 676 / 240  # altura do escudo -> 66% do ícone
    tx = 512 - 165 * s
    ty = 512 - 170 * s
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  {defs}
  <rect width="1024" height="1024" fill="url(#fv-bg)"/>
  <g transform="translate({tx:.2f},{ty:.2f}) scale({s:.4f})" filter="url(#fv-shadow)">
  {shield(variant, outline=dark)}
  </g>
</svg>
'''


def foreground_svg(variant, scale_pct=0.62):
    """Camada da frente do ícone adaptativo do Android (fundo transparente, zona segura)."""
    s = 1024 * scale_pct / 240
    tx = 512 - 165 * s
    ty = 512 - 170 * s
    defs = DEFS.replace('<defs>', '<defs>\n    <filter id="fv-shadow" x="-30%" y="-20%" width="160%" height="150%">'
                        '<feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#0B2A3C" flood-opacity="0.25"/></filter>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  {defs}
  <g transform="translate({tx:.2f},{ty:.2f}) scale({s:.4f})" filter="url(#fv-shadow)">
  {shield(variant)}
  </g>
</svg>
'''


def horizontal_svg(variant, dark=False):
    text_color = OFFWHITE if dark else NAVY
    sub_color = GOLD if dark else '#9A7B3F'
    word, ww = text_path(WORDMARK_FONT, 'Fynvault', 92, 0, 0, 1.2)
    tag, tw = text_path(TAGLINE_FONT, 'PERSONAL FINANCE', 14, 0, 0, 0)
    # espaçamento da tagline para ocupar a largura do nome
    n = len('PERSONAL FINANCE') - 1
    track = (ww - 6 - tw) / n
    tag, tw = text_path(TAGLINE_FONT, 'PERSONAL FINANCE', 14, 0, 0, track)
    sh = 0.62
    x0 = 122
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {x0 + ww + 12:.0f} 180">
  {DEFS}
  <g transform="translate({12 - 94 * sh:.2f},{14 - 44 * sh:.2f}) scale({sh})">
  {shield(variant, outline=dark)}
  </g>
  <g transform="translate({x0},108)"><path fill="{text_color}" d="{word}"/></g>
  <g transform="translate({x0 + 3},146)"><path fill="{sub_color}" d="{tag}"/></g>
</svg>
'''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--variant', default='cormorant', choices=MONOGRAM_FONTS)
    ap.add_argument('--out', default=os.path.join(ROOT, 'public', 'brand'))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    files = {
        'logo.svg': logo_svg(a.variant),
        'icon.svg': icon_svg(a.variant),
        'icon-dark.svg': icon_svg(a.variant, dark=True),
        'icon-foreground.svg': foreground_svg(a.variant),
        'logo-horizontal.svg': horizontal_svg(a.variant),
        'logo-horizontal-dark.svg': horizontal_svg(a.variant, dark=True),
    }
    for name, svg in files.items():
        with open(os.path.join(a.out, name), 'w') as fh:
            fh.write(svg)
    print('ok:', ', '.join(files))


if __name__ == '__main__':
    main()
