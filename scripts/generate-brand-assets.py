#!/usr/bin/env python3
"""
Generate all official Reberon Hotel brand assets (SVGs, PNGs, ICOs, Favicons, Apple Touch Icons, OG Images)
directly from the master vector PDF extracted SVG (`branding/extracted.svg`).

Official Brand Colors (from Master Vector PDF):
- Brand Copper (RH Monogram & Tagline): #D76E1B (rgb 215, 110, 27)
- Brand Royal Navy (Reberon Hotel Wordmark): #1A1E43 (rgb 26, 30, 67)
- Brand Platinum Card Background: #D5D6D6 (rgb 213, 214, 214)
"""
import os
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET

ROOT = "/home/sisi-labs/Projects/reberon_hotel_web"
EXTRACTED_SVG = os.path.join(ROOT, "branding", "extracted.svg")

BRAND_DIRS = [
    os.path.join(ROOT, "branding"),
    os.path.join(ROOT, "apps", "web", "public", "brand"),
    os.path.join(ROOT, "apps", "admin", "public", "brand"),
]

for d in BRAND_DIRS:
    os.makedirs(d, exist_ok=True)

tree = ET.parse(EXTRACTED_SVG)
root = tree.getroot()
ns = {"svg": "http://www.w3.org/2000/svg"}
paths = root.findall(".//svg:path", ns)

def get_d(idx):
    return paths[idx].attrib["d"]

# Categorize paths by index from extracted.svg:
# 0..1: background card
# 2..13: "Reberon Hotel" wordmark (x: 35.9..537.4, y: 233.5..283.0)
# 14..17: "RH" monogram emblem (x: 221.8..373.8, y: 73.3..216.8)
# 18..50: "— Stay In Comfort, Leave With Memories —" tagline (x: 34.4..539.3, y: 297.7..320.6)

wordmark_ds = [get_d(i) for i in range(2, 14)]
monogram_ds = [get_d(i) for i in range(14, 18)]
tagline_ds = [get_d(i) for i in range(18, 51)]

COPPER = "#D76E1B"
COPPER_LIGHT = "#E88432"
NAVY = "#1A1E43"
NAVY_DEEP = "#10132B"
PLATINUM = "#D5D6D6"
WHITE = "#FFFFFF"

def make_path_group(ds, fill, transform=""):
    tf = f' transform="{transform}"' if transform else ""
    inner = "\n  ".join(f'<path d="{d}" fill="{fill}" fill-rule="nonzero"/>' for d in ds)
    return f"<g{tf}>\n  {inner}\n</g>"

# 1. Full Stacked Logo - Light Mode (Transparent BG, Copper RH + Navy Wordmark + Copper Tagline)
# Tightly cropped around x=[25..550], y=[63..330] => viewBox="24 63 526 268"
svg_full_light = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="24 63 526 268" fill="none">
  {make_path_group(monogram_ds, COPPER)}
  {make_path_group(wordmark_ds, NAVY)}
  {make_path_group(tagline_ds, COPPER)}
</svg>
'''

# 2. Full Stacked Logo - Dark Mode (Transparent BG, Copper RH + White Wordmark + Copper Tagline)
svg_full_dark = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="24 63 526 268" fill="none">
  {make_path_group(monogram_ds, COPPER_LIGHT)}
  {make_path_group(wordmark_ds, WHITE)}
  {make_path_group(tagline_ds, COPPER_LIGHT)}
</svg>
'''

# 3. Full Stacked Logo - Official Platinum Card (#D5D6D6 background, full artboard)
svg_full_card = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 595.276 393.958" fill="none">
  <rect width="595.276" height="393.958" fill="{PLATINUM}"/>
  {make_path_group(monogram_ds, COPPER)}
  {make_path_group(wordmark_ds, NAVY)}
  {make_path_group(tagline_ds, COPPER)}
</svg>
'''

# 4. Full Stacked Logo - Deep Royal Navy Card (#1A1E43 background, for Dark/Luxury presentation)
svg_full_navy_card = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 595.276 393.958" fill="none">
  <rect width="595.276" height="393.958" fill="{NAVY}"/>
  {make_path_group(monogram_ds, COPPER_LIGHT)}
  {make_path_group(wordmark_ds, WHITE)}
  {make_path_group(tagline_ds, COPPER_LIGHT)}
</svg>
'''

# 5. Horizontal Lockup Logo - Light Mode (Monogram on left, Wordmark + Tagline on right)
# Monogram original bbox: x=[221.8, 373.8] (w=152), y=[73.3, 216.8] (h=143.5).
# Let's translate monogram by (-205, -55) so it sits at x=[16.8, 168.8], y=[18.3, 161.8]
# Wordmark + Tagline original bbox: x=[34.4, 539.3] (w=504.9), y=[233.5, 320.6] (h=87.1).
# Let's translate wordmark+tagline by (160, -187) so it sits at x=[194.4, 699.3], y=[46.5, 133.6]
# Total Horizontal viewBox: "0 0 715 180"
svg_horizontal_light = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 715 180" fill="none">
  {make_path_group(monogram_ds, COPPER, "translate(-205, -55)")}
  {make_path_group(wordmark_ds, NAVY, "translate(160, -187)")}
  {make_path_group(tagline_ds, COPPER, "translate(160, -187)")}
</svg>
'''

# 6. Horizontal Lockup Logo - Dark Mode (Monogram on left, White Wordmark + Copper Tagline on right)
svg_horizontal_dark = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 715 180" fill="none">
  {make_path_group(monogram_ds, COPPER_LIGHT, "translate(-205, -55)")}
  {make_path_group(wordmark_ds, WHITE, "translate(160, -187)")}
  {make_path_group(tagline_ds, COPPER_LIGHT, "translate(160, -187)")}
</svg>
'''

# 7. Standalone RH Monogram - Copper, Navy, White (Square viewBox="214 65 168 160")
svg_monogram_copper = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="214 65 168 160" fill="none">
  {make_path_group(monogram_ds, COPPER)}
</svg>
'''

svg_monogram_navy = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="214 65 168 160" fill="none">
  {make_path_group(monogram_ds, NAVY)}
</svg>
'''

svg_monogram_white = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="214 65 168 160" fill="none">
  {make_path_group(monogram_ds, WHITE)}
</svg>
'''

# 8. App Icon / Favicon Badge (Square 256x256 Royal Navy #1A1E43 rounded crest with Copper #D76E1B RH monogram)
# Monogram center is (297.8, 145.05). To center in 256x256 (center 128, 128) with scale 1.15:
# transform="translate(128, 128) scale(1.15) translate(-297.8, -145.05)"
svg_icon_badge = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="48" fill="{NAVY}"/>
  <rect x="10" y="10" width="236" height="236" rx="40" stroke="{COPPER}" stroke-opacity="0.38" stroke-width="2"/>
  {make_path_group(monogram_ds, COPPER, "translate(128, 128) scale(1.18) translate(-297.8, -145.05)")}
</svg>
'''

# 9. OpenGraph Social Banner SVG (1200x630) - Royal Navy & Platinum Luxury Card with Full Logo
svg_og_banner = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" fill="none">
  <rect width="1200" height="630" fill="{NAVY}"/>
  <rect x="28" y="28" width="1144" height="574" rx="16" stroke="{COPPER}" stroke-opacity="0.45" stroke-width="2"/>
  <rect x="44" y="44" width="1112" height="542" rx="10" fill="{PLATINUM}"/>
  <g transform="translate(600, 305) scale(1.55) translate(-287, -196)">
    {make_path_group(monogram_ds, COPPER)}
    {make_path_group(wordmark_ds, NAVY)}
    {make_path_group(tagline_ds, COPPER)}
  </g>
</svg>
'''

SVG_FILES = {
    "logo-full-light.svg": svg_full_light,
    "logo-full-dark.svg": svg_full_dark,
    "logo-full-official-card.svg": svg_full_card,
    "logo-full-navy-card.svg": svg_full_navy_card,
    "logo-horizontal-light.svg": svg_horizontal_light,
    "logo-horizontal-dark.svg": svg_horizontal_dark,
    "logo-monogram-copper.svg": svg_monogram_copper,
    "logo-monogram-navy.svg": svg_monogram_navy,
    "logo-monogram-white.svg": svg_monogram_white,
    "icon-badge.svg": svg_icon_badge,
    "og-banner.svg": svg_og_banner,
}

for filename, content in SVG_FILES.items():
    for d in BRAND_DIRS:
        with open(os.path.join(d, filename), "w", encoding="utf-8") as f:
            f.write(content)

# Also copy icon-badge.svg to Next.js app icon locations
NEXT_ICON_PATHS = [
    os.path.join(ROOT, "apps", "web", "app", "icon.svg"),
    os.path.join(ROOT, "apps", "web", "public", "icon.svg"),
    os.path.join(ROOT, "apps", "admin", "app", "icon.svg"),
    os.path.join(ROOT, "apps", "admin", "public", "icon.svg"),
]
for p in NEXT_ICON_PATHS:
    with open(p, "w", encoding="utf-8") as f:
        f.write(svg_icon_badge)

def render_svg_to_png(svg_path, png_path, width, height=None):
    if height is None:
        height = width
    cmd = [
        "convert",
        "-background", "none",
        "-density", "300",
        svg_path,
        "-resize", f"{width}x{height}",
        png_path
    ]
    subprocess.run(cmd, check=True)

# Render high-res PNG versions of all logos
LOGO_PNG_SPECS = [
    ("logo-full-light.svg", "logo-full-light.png", 1200, 612),
    ("logo-full-dark.svg", "logo-full-dark.png", 1200, 612),
    ("logo-full-official-card.svg", "logo-full-official-card.png", 1200, 794),
    ("logo-full-navy-card.svg", "logo-full-navy-card.png", 1200, 794),
    ("logo-horizontal-light.svg", "logo-horizontal-light.png", 1200, 302),
    ("logo-horizontal-dark.svg", "logo-horizontal-dark.png", 1200, 302),
    ("logo-monogram-copper.svg", "logo-monogram-copper.png", 512, 512),
    ("logo-monogram-navy.svg", "logo-monogram-navy.png", 512, 512),
    ("logo-monogram-white.svg", "logo-monogram-white.png", 512, 512),
    ("og-banner.svg", "og-image.png", 1200, 630),
]

base_brand_dir = BRAND_DIRS[0]
for svg_name, png_name, w, h in LOGO_PNG_SPECS:
    src_svg = os.path.join(base_brand_dir, svg_name)
    out_png = os.path.join(base_brand_dir, png_name)
    render_svg_to_png(src_svg, out_png, w, h)
    for d in BRAND_DIRS[1:]:
        shutil.copy2(out_png, os.path.join(d, png_name))

# Render all standard Icon sizes (16, 32, 48, 72, 96, 128, 144, 152, 180, 192, 384, 512)
ICON_SIZES = [16, 32, 48, 72, 96, 128, 144, 152, 180, 192, 384, 512]
icon_svg_path = os.path.join(base_brand_dir, "icon-badge.svg")

for sz in ICON_SIZES:
    png_name = f"icon-{sz}x{sz}.png"
    out_png = os.path.join(base_brand_dir, png_name)
    render_svg_to_png(icon_svg_path, out_png, sz, sz)
    for d in BRAND_DIRS[1:]:
        shutil.copy2(out_png, os.path.join(d, png_name))

# Copy special icons to public root of web and admin
for app in ["web", "admin"]:
    pub_dir = os.path.join(ROOT, "apps", app, "public")
    app_dir = os.path.join(ROOT, "apps", app, "app")
    shutil.copy2(os.path.join(base_brand_dir, "icon-180x180.png"), os.path.join(pub_dir, "apple-touch-icon.png"))
    shutil.copy2(os.path.join(base_brand_dir, "icon-192x192.png"), os.path.join(pub_dir, "icon-192.png"))
    shutil.copy2(os.path.join(base_brand_dir, "icon-512x512.png"), os.path.join(pub_dir, "icon-512.png"))
    shutil.copy2(os.path.join(base_brand_dir, "og-image.png"), os.path.join(pub_dir, "og-image.png"))

# Generate multi-resolution favicon.ico (16x16, 32x32, 48x48)
favicon_ico_path = os.path.join(base_brand_dir, "favicon.ico")
subprocess.run([
    "convert",
    os.path.join(base_brand_dir, "icon-16x16.png"),
    os.path.join(base_brand_dir, "icon-32x32.png"),
    os.path.join(base_brand_dir, "icon-48x48.png"),
    favicon_ico_path
], check=True)

for d in BRAND_DIRS[1:]:
    shutil.copy2(favicon_ico_path, os.path.join(d, "favicon.ico"))
for app in ["web", "admin"]:
    shutil.copy2(favicon_ico_path, os.path.join(ROOT, "apps", app, "public", "favicon.ico"))

print("Successfully generated all SVG, PNG, ICO, Favicon, Apple Touch Icon, and OG brand assets!")
