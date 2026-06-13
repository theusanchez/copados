#!/usr/bin/env python3
"""Generate the Copa 2026 app icons (World Cup trophy) from a single source.

Produces the PWA / favicon / apple-touch set. The "maskable" variant scales the
artwork into the safe zone so circular launcher masks don't clip the green ring.
"""
import cairosvg

DEFS = '''
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFEFB0"/>
      <stop offset="0.35" stop-color="#F4C75A"/>
      <stop offset="0.7" stop-color="#E0A33A"/>
      <stop offset="1" stop-color="#B97D22"/>
    </linearGradient>
    <clipPath id="globeClip"><circle cx="256" cy="146" r="58"/></clipPath>
  </defs>'''

# Ring + trophy, drawn in a 512x512 coordinate space, centred on (256,256).
ART = '''
  <circle cx="256" cy="256" r="232" fill="none" stroke="#2ea043" stroke-width="14"/>
  <path fill="url(#gold)" d="M240 200
    C 226 210 192 224 182 254
    C 173 288 196 332 220 360
    C 229 372 233 384 235 398
    L 277 398
    C 279 384 283 372 292 360
    C 316 332 339 288 330 254
    C 320 224 286 210 272 200 Z"/>
  <path fill="none" stroke="#9a6a1e" stroke-width="6" stroke-linecap="round" opacity="0.55"
    d="M256 206 C 244 258 270 312 256 392"/>
  <circle cx="256" cy="146" r="58" fill="url(#gold)"/>
  <g clip-path="url(#globeClip)" stroke="#9a6a1e" stroke-width="5" fill="none" opacity="0.85">
    <ellipse cx="256" cy="146" rx="24" ry="58"/>
    <ellipse cx="256" cy="146" rx="47" ry="58"/>
    <line x1="198" y1="146" x2="314" y2="146"/>
    <path d="M202 116 Q256 134 310 116"/>
    <path d="M202 176 Q256 158 310 176"/>
  </g>
  <rect x="210" y="396" width="92" height="22" rx="11" fill="url(#gold)"/>
  <rect x="188" y="416" width="136" height="30" rx="13" fill="url(#gold)"/>'''


def svg(maskable=False):
    art = ART
    if maskable:
        # shrink into the ~80% safe circle so masks never clip the ring
        art = f'<g transform="translate(256,256) scale(0.84) translate(-256,-256)">{ART}</g>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
            f'{DEFS}<rect width="512" height="512" fill="#0d1117"/>{art}</svg>')


TARGETS = [
    ("icons/icon-512.png", 512, False),
    ("icons/icon-192.png", 192, False),
    ("icons/favicon-32.png", 32, False),
    ("icons/apple-touch-icon.png", 180, False),
    ("icons/icon-maskable-512.png", 512, True),
]

for path, size, maskable in TARGETS:
    cairosvg.svg2png(bytestring=svg(maskable).encode(), write_to=path,
                     output_width=size, output_height=size)
    print(f"wrote {path} ({size}px{', maskable' if maskable else ''})")
