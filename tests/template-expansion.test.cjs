const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const expansion = import('../src/template-expansion.ts');

test('Studio Editions append 120 useful layouts across 30 authored compositions, preserving the complete prior catalog', async () => {
  const { STUDIO_TEMPLATE_LIBRARY: templates, STUDIO_TEMPLATE_STATS: stats } = await expansion;
  const { TEMPLATES } = await import('../src/templates.ts');
  assert.equal(templates.length, 120);
  assert.equal(stats.compositions, 30); assert.equal(stats.collections, 33); assert.equal(stats.photoLayouts, 76);
  assert.deepEqual(TEMPLATES.slice(530).map(template => template.id), templates.map(template => template.id));
  assert.equal(new Set(templates.map(template => template.name)).size, 120);
  assert.equal(new Set(templates.slice(0, 30).map(template => template.composition)).size, 30, 'first gallery pages must show different purposes, not palette twins');
  const geometries = new Set(templates.map(template => JSON.stringify(template.elements.map(element => [element.type, element.x, element.y, element.width, element.height]))));
  assert.ok(geometries.size >= 110, 'editions adapt their geometric layouts as well as their copy and palette');
  for (const category of ['Real Estate', 'Lesson Plan', 'Study Guide', 'Flashcard', 'Ticket', 'Agenda', 'Media Kit', 'Catalog', 'Price List', 'Brand Board', 'Checklist', 'Photo Collage', 'Meal Planner', 'Tracker', 'Budget', 'Form']) assert.ok(stats.categories.includes(category), category);
  const families = new Map();
  for (const template of templates) families.set(template.composition, (families.get(template.composition) || 0) + 1);
  for (const count of families.values()) assert.equal(count, 4);
});

test('every new layout fits its artboard and uses measured offline fonts with bounded render work', async () => {
  const { STUDIO_TEMPLATE_LIBRARY: templates } = await expansion;
  const fontManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../scripts/font-manifest.json')));
  const metrics = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/template-font-metrics.json')));
  const fonts = new Set(fontManifest.families.map(font => font.name));
  for (const template of templates) {
    assert.ok(template.elements.length <= 64, `${template.id} objects must stay bounded`);
    for (const element of template.elements) {
      const message = `${template.id}: ${element.name}`;
      assert.ok(element.x >= 0 && element.y >= 0 && element.width > 0 && element.height > 0, message);
      assert.ok(element.x + element.width <= template.width + 1 && element.y + element.height <= template.height + 1, message);
      assert.ok(element.name.trim().length > 0, message);
      assert.equal(element.rotation || 0, 0, 'authoring bounds should also be the visible object bounds');
      if (element.type !== 'text') continue;
      assert.ok(fonts.has(element.fontFamily), message);
      const face = metrics[element.fontFamily]?.[Number(element.fontWeight) >= 600 ? '700' : '400'];
      assert.ok(face, `${message} requires measured glyph advances`);
      assert.ok(element.fontSize >= 16, message);
      const requiredHeight = element.fontSize * 1.13 * (1 + (element.text.split('\n').length - 1) * element.lineHeight);
      assert.ok(requiredHeight <= element.height + 1, `${message} vertically overflows`);
      for (const line of element.text.split('\n')) {
        const units = [...line].reduce((sum, char) => sum + (face[char] ?? .75), 0) + Math.max(0, line.length - 1) * (element.letterSpacing || 0) / 1000;
        assert.ok(units * element.fontSize <= element.width * .97, `${message} horizontally overflows`);
      }
      assert.ok(!/lorem ipsum|your headline|sample text/i.test(element.text), message);
    }
  }
});

test('all 76 photo layouts reuse the verified portable collection and include actual source metadata', async () => {
  const { STUDIO_TEMPLATE_LIBRARY: templates, STUDIO_TEMPLATE_PROVENANCE: provenance } = await expansion;
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/template-photos/manifest.json')));
  const images = new Map(manifest.images.map(image => [`/template-photos/${image.file}`, image]));
  assert.equal(provenance.requiresNetwork, false); assert.match(provenance.source, /Original layouts/);
  const used = new Set();
  for (const template of templates) for (const element of template.elements.filter(item => item.type === 'image')) {
    const original = images.get(element.src); assert.ok(original, template.id);
    assert.equal(element.imageFit, 'cover');
    assert.equal(element.source.id, `commons:${original.commonsPageId}`);
    assert.equal(element.source.artist, original.author); assert.equal(element.source.license, original.license);
    assert.equal(element.source.sourceUrl, original.sourcePage);
    used.add(element.src);
  }
  assert.ok(used.size >= 11, 'photography covers distinct subjects');
});

test('forms contain useful labeled entry areas and remain explicit local document layouts', async () => {
  const { STUDIO_TEMPLATE_LIBRARY: templates } = await expansion;
  const forms = templates.filter(template => template.category === 'Form');
  assert.equal(forms.length, 8);
  assert.equal(new Set(forms.map(template => template.composition)).size, 2);
  for (const form of forms) {
    assert.match(form.description, /does not collect online responses/);
    const content = form.elements.filter(element => element.type === 'text').map(element => element.text.replaceAll('\n', ' ')).join(' ');
    assert.match(content, /EMAIL ADDRESS|CONTACT EMAIL/);
    assert.ok(form.elements.filter(element => element.type === 'rect' && element.rx === 7).length >= 4, 'each labeled response area is an editable object');
    assert.ok(form.elements.filter(element => element.type === 'rect' && element.width === 18 && element.height === 18).length === 4, 'four editable choice checkboxes');
  }
});

test('example budgets sum correctly and planners contain complete editable week grids', async () => {
  const { STUDIO_TEMPLATE_LIBRARY: templates } = await expansion;
  for (const template of templates.filter(item => item.category === 'Budget')) {
    const amounts = template.elements.filter(element => element.type === 'text' && /^[\d,]+$/.test(element.text));
    assert.equal(amounts.length, 6); assert.equal(amounts.reduce((sum, element) => sum + Number(element.text.replaceAll(',', '')), 0), 10000);
  }
  for (const template of templates.filter(item => item.category === 'Meal Planner')) for (const day of ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']) assert.ok(template.elements.some(element => element.text === day), `${template.id} ${day}`);
  for (const template of templates.filter(item => item.category === 'Tracker')) assert.equal(template.elements.filter(element => element.type === 'rect' && element.width === 54 && element.height === 54).length, 35);
});
