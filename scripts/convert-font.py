"""Losslessly package official TTFs as WOFF2, retaining all glyphs and metadata."""
import json
import sys
from fontTools.ttLib import TTFont

font = TTFont(sys.argv[1], recalcTimestamp=False)
weight = str(font['OS/2'].usWeightClass)
if 'fvar' in font:
    for axis in font['fvar'].axes:
        if axis.axisTag == 'wght':
            weight = f'{int(axis.minValue)} {int(axis.maxValue)}'
font.flavor = 'woff2'
font.save(sys.argv[2], reorderTables=False)
print(json.dumps({'weight': weight, 'glyphs': font['maxp'].numGlyphs}))
