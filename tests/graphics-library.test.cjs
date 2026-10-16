const test=require('node:test');
const assert=require('node:assert/strict');
const catalog=import('../src/graphics-library.ts');

test('original graphics cover192 distinct useful assets across10 categories',async()=>{
  const {GRAPHICS,GRAPHICS_PROVENANCE}=await catalog;
  assert.equal(GRAPHICS.length,192);
  assert.equal(new Set(GRAPHICS.map(g=>g.id)).size,192);
  assert.equal(new Set(GRAPHICS.map(g=>g.name)).size,192);
  assert.equal(new Set(GRAPHICS.map(g=>g.category)).size,10);
  assert.equal(new Set(GRAPHICS.map(g=>g.parts.map(p=>p.path).join('|'))).size,192,'assets must differ in their vector geometry, not only their names or colors');
  for(const category of ['Arrows','Lines & dividers','Hand-drawn marks','Botanical','Geometric','Badges & labels','Charts & infographics','UI & social','Decorative frames','Illustrations'])assert.ok(GRAPHICS.some(g=>g.category===category));
  assert.equal(GRAPHICS_PROVENANCE.networkRequired,false);
  assert.equal(GRAPHICS_PROVENANCE.animation,'static');
  assert.equal(GRAPHICS_PROVENANCE.license,'AGPL-3.0-only');
});

test('every graphic is bounded authored path data with editable solid colors',async()=>{
  const {GRAPHICS}=await catalog;
  for(const graphic of GRAPHICS){
    assert.match(graphic.id,/^graphic-[a-z0-9-]+$/);
    assert.ok(graphic.name.length>3&&graphic.tags.length>=2);
    assert.ok(Number.isFinite(graphic.width)&&graphic.width>=100&&graphic.width<=400);
    assert.ok(Number.isFinite(graphic.height)&&graphic.height>=100&&graphic.height<=400);
    assert.ok(graphic.parts.length>=1&&graphic.parts.length<=40);
    for(const part of graphic.parts){
      assert.ok(part.name&&part.path.trim().length>3,graphic.id);
      assert.match(part.path,/^[Mm]/,graphic.id);
      assert.ok(!/[^MmLlHhVvCcSsQqTtAaZz\d+.,\s-]/.test(part.path),graphic.id);
      assert.ok(!/NaN|Infinity|undefined/i.test(part.path),graphic.id);
      const numbers=part.path.match(/[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi)||[];
      assert.ok(numbers.every(n=>Number.isFinite(Number(n))&&Math.abs(Number(n))<=500),graphic.id);
      assert.ok(part.fill==='none'||/^#[a-f0-9]{6}$/i.test(part.fill),graphic.id);
      assert.ok(part.stroke===undefined||/^#[a-f0-9]{6}$/i.test(part.stroke),graphic.id);
      assert.ok(Number.isFinite(part.strokeWidth)&&part.strokeWidth>=0&&part.strokeWidth<=30,graphic.id);
      if(part.opacity!==undefined)assert.ok(part.opacity>=0&&part.opacity<=1,graphic.id);
    }
    const colors=[...new Set(graphic.parts.flatMap(p=>[p.fill,p.stroke].filter(c=>c&&c!=='none')))];
    assert.deepEqual(graphic.palette,colors,graphic.id);
    assert.ok(colors.length>=1&&colors.length<=8,graphic.id);
  }
});

test('graphics search matches category, meaningful tags and all query words',async()=>{
  const {GRAPHICS,getGraphic,searchGraphics}=await catalog;
  for(const graphic of GRAPHICS)assert.equal(getGraphic(graphic.id),graphic);
  assert.equal(getGraphic('graphic-not-found'),undefined);
  assert.equal(searchGraphics().length,192);
  assert.equal(searchGraphics('','Arrows').length,24);
  assert.equal(searchGraphics('MONSTERA')[0].id,'graphic-botanical-monstera');
  assert.ok(searchGraphics('circle frame').every(g=>g.name.toLowerCase().includes('circle')&&g.category==='Decorative frames'));
  assert.ok(searchGraphics('photo').some(g=>g.id==='graphic-illustration-polaroid-scene'));
  assert.equal(searchGraphics('unlikely-nonexistent-query').length,0);
  assert.equal(searchGraphics('coffee','Botanical').length,0);
});

test('SVG previews preserve every editable path without image or remote dependencies',async()=>{
  const {GRAPHICS,graphicToSVG}=await catalog;
  for(const graphic of GRAPHICS){
    const svg=graphicToSVG(graphic);
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
    assert.equal((svg.match(/<path /g)||[]).length,graphic.parts.length);
    assert.match(svg,new RegExp(`viewBox="0 0 ${graphic.width} ${graphic.height}"`));
    assert.ok(!/<(?:image|script|foreignObject|use|style)\b|(?:href|onload)=|url\(/i.test(svg),graphic.id);
  }
  const escaped=graphicToSVG({...GRAPHICS[0],name:'A <tag> & "quote"'});
  assert.ok(escaped.includes('A &lt;tag&gt; &amp; &quot;quote&quot;'));
  assert.ok(!escaped.includes('<tag>'));
});
