"""Audit bundled full-Unicode faces; --sources also compares the official pinned TTF cache."""
import argparse
import hashlib
import json
from pathlib import Path
from fontTools.ttLib import TTFont
import fontTools
import brotli

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sources', action='store_true', help='Require and compare build/font-sources to every packaged WOFF2.')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'scripts/font-manifest.json').read_text())
if fontTools.__version__ != manifest['conversion']['fonttools'] or brotli.__version__ != manifest['conversion']['brotli']:
    raise RuntimeError('Use the pinned fonttools/brotli versions in build/font-tools-env.')

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def axes(font):
    return [(axis.axisTag, axis.minValue, axis.defaultValue, axis.maxValue)
            for axis in font['fvar'].axes] if 'fvar' in font else []

faces = 0
for family in manifest['families']:
    license_bytes = (root / 'public/fonts' / family['license']['file']).read_bytes()
    if sha256(license_bytes) != family['license']['sha256']:
        raise RuntimeError('License checksum changed for ' + family['name'])
    for face in family['faces']:
        packaged = root / 'public/fonts' / face['file']
        if sha256(packaged.read_bytes()) != face['sha256']:
            raise RuntimeError('WOFF2 checksum changed for ' + face['file'])
        font = TTFont(packaged, recalcTimestamp=False)
        cmap = font.getBestCmap()
        cmap_hash = sha256(json.dumps(sorted(cmap.items()), ensure_ascii=True, separators=(',', ':')).encode())
        if len(cmap) != face['unicodeCodepoints'] or cmap_hash != face['unicodeCmapSha256'] or font['maxp'].numGlyphs != face['glyphs']:
            raise RuntimeError('Full Unicode mapping or glyph count changed for ' + face['file'])
        if args.sources:
            source_path = root / 'build/font-sources' / face['source'].replace('/', '-')
            source_bytes = source_path.read_bytes()
            if sha256(source_bytes) != face['sourceSha256']:
                raise RuntimeError('Official source checksum changed for ' + face['source'])
            source = TTFont(source_path, recalcTimestamp=False)
            if source.getBestCmap() != cmap or source['maxp'].numGlyphs != font['maxp'].numGlyphs or axes(source) != axes(font):
                raise RuntimeError('Source/WOFF2 Unicode, glyph or variable-axis mismatch for ' + face['file'])
            source.close()
        font.close()
        faces += 1
print(json.dumps({'families': len(manifest['families']), 'faces': faces, 'unicodeMappings': 'verified', 'sourceComparison': args.sources}))
