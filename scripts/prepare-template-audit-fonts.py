"""Optional offline font preparation for node-canvas template visual checks.

The app uses the original verified WOFF2 files. Pango/node-canvas cannot read
WOFF2 or reliably select a variable-font weight, so this developer-only helper
instances the six template typefaces into an ignored local TTF cache. Requires
the same fontTools/Brotli environment used by prepare-fonts.mjs.
"""
from pathlib import Path
import hashlib
import json

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = json.loads((ROOT / "scripts/font-manifest.json").read_text())
DESTINATION = ROOT / "build/template-audit-fonts"
FAMILIES = {"DM Sans", "Playfair Display", "League Spartan", "Cormorant Garamond", "DM Serif Display", "Caveat"}
DESTINATION.mkdir(parents=True, exist_ok=True)
entries = []

for family in MANIFEST["families"]:
    if family["name"] not in FAMILIES:
        continue
    face = family["faces"][0]
    source = ROOT / "public/fonts" / face["file"]
    if hashlib.sha256(source.read_bytes()).hexdigest() != face["sha256"]:
        raise ValueError(f"Verified font checksum mismatch: {source}")
    original = TTFont(source)
    variable = "fvar" in original
    original.close()
    for weight in ([400, 600, 700] if variable else [400]):
        font = TTFont(source)
        if variable:
            location = {axis.axisTag: axis.defaultValue for axis in font["fvar"].axes}
            location["wght"] = weight
            font = instantiateVariableFont(font, location, inplace=True)
        font.flavor = None
        filename = f'{family["slug"]}-{weight}.ttf'
        output = DESTINATION / filename
        font.save(output)
        font.close()
        entries.append({"family": family["name"], "weight": weight, "file": filename, "sourceFile": face["file"], "sourceSha256": face["sha256"], "sha256": hashlib.sha256(output.read_bytes()).hexdigest()})

(DESTINATION / "manifest.json").write_text(json.dumps({"purpose": "Optional node-canvas template audit only; never distributed in the app", "sourceCommit": MANIFEST["commit"], "fonts": entries}, indent=2) + "\n")
print(f"Prepared {len(entries)} static template-audit faces from verified offline WOFF2 assets.")
