"""Convertit une police OpenType (contours CFF) en TrueType (contours glyf) : pdf-lib intègre sans risque les polices TrueType.
Usage : python3 tools/otf2ttf.py entrée.otf sortie.ttf   (d'après l'exemple otf2ttf de fontTools, licence MIT)"""
import sys
from fontTools.ttLib import TTFont, newTable
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

def otf_to_ttf(font, max_err=1.0, reverse_direction=True):
    assert font['head'].glyphDataFormat == 0
    glyphOrder = font.getGlyphOrder(); glyphSet = font.getGlyphSet(); glyf = newTable('glyf'); glyf.glyphOrder = glyphOrder; glyf.glyphs = {}
    for name in glyphOrder:
        pen = TTGlyphPen(glyphSet)
        glyphSet[name].draw(Cu2QuPen(pen, max_err, reverse_direction=reverse_direction))
        glyf[name] = pen.glyph()
    font['loca'] = newTable('loca'); font['glyf'] = glyf
    del font['CFF ']
    if 'VORG' in font: del font['VORG']
    glyf.compile(font)
    font['maxp'] = maxp = newTable('maxp'); maxp.tableVersion = 0x00010000
    maxp.maxZones = 1; maxp.maxTwilightPoints = 0; maxp.maxStorage = 0; maxp.maxFunctionDefs = 0; maxp.maxInstructionDefs = 0; maxp.maxStackElements = 0; maxp.maxSizeOfInstructions = 0; maxp.maxComponentElements = max(len(g.components if hasattr(g, 'components') else []) for g in glyf.glyphs.values())
    maxp.compile(font)
    post = font['post']; post.formatType = 2.0; post.extraNames = []; post.mapping = {}; post.glyphOrder = glyphOrder
    font['head'].indexToLocFormat = 0
    font.sfntVersion = '\x00\x01\x00\x00'

f = TTFont(sys.argv[1]); otf_to_ttf(f); f.save(sys.argv[2])
