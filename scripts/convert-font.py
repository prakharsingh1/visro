"""Losslessly package official TTFs as WOFF2, retaining every Unicode glyph and axis."""
import json
import sys
from fontTools.ttLib import TTFont

font = TTFont(sys.argv[1], recalcTimestamp=False)
weight = str(font['OS/2'].usWeightClass)
if 'fvar' in font:
    for axis in font['fvar'].axes:
        if axis.axisTag == 'wght':
            weight = f'{int(axis.minValue)} {int(axis.maxValue)}'
source_cmaps = [(table.platformID, table.platEncID, table.language, table.cmap.copy())
                for table in font['cmap'].tables if table.isUnicode()]
source_axes = [(axis.axisTag, axis.minValue, axis.defaultValue, axis.maxValue)
               for axis in font['fvar'].axes] if 'fvar' in font else []
source_glyphs = font['maxp'].numGlyphs
font.flavor = 'woff2'
font.save(sys.argv[2], reorderTables=False)
restored = TTFont(sys.argv[2], recalcTimestamp=False)
restored_cmaps = [(table.platformID, table.platEncID, table.language, table.cmap.copy())
                  for table in restored['cmap'].tables if table.isUnicode()]
restored_axes = [(axis.axisTag, axis.minValue, axis.defaultValue, axis.maxValue)
                 for axis in restored['fvar'].axes] if 'fvar' in restored else []
if source_cmaps != restored_cmaps or source_axes != restored_axes or source_glyphs != restored['maxp'].numGlyphs:
    raise RuntimeError('WOFF2 conversion changed Unicode mappings, variable axes or glyph count.')
print(json.dumps({'weight': weight, 'glyphs': source_glyphs,
                  'unicodeCodepoints': len(restored.getBestCmap())}))
