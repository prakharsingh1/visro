const test=require('node:test');
const assert=require('node:assert/strict');
const catalog=import('../src/graphics-library.ts');

test('original graphics cover320 distinct useful assets across16 categories',async()=>{
  const {GRAPHICS,GRAPHICS_PROVENANCE}=await catalog;
  assert.equal(GRAPHICS.length,320);
  assert.equal(new Set(GRAPHICS.map(g=>g.id)).size,320);
  assert.equal(new Set(GRAPHICS.map(g=>g.name)).size,320);
  assert.equal(new Set(GRAPHICS.map(g=>g.category)).size,16);
  assert.equal(new Set(GRAPHICS.map(g=>g.parts.map(p=>p.path).join('|'))).size,320,'assets must differ in their vector geometry, not only their names or colors');
  for(const category of ['Arrows','Lines & dividers','Hand-drawn marks','Botanical','Geometric','Badges & labels','Charts & infographics','UI & social','Decorative frames','Illustrations','3D illustrations','Business','Education','Nature & animals','Symbols','Decorative accents'])assert.ok(GRAPHICS.some(g=>g.category===category));
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
  assert.equal(searchGraphics().length,320);
  assert.equal(searchGraphics('','Arrows').length,24);
  assert.equal(searchGraphics('MONSTERA')[0].id,'graphic-botanical-monstera');
  assert.ok(searchGraphics('circle frame').every(g=>g.name.toLowerCase().includes('circle')&&g.category==='Decorative frames'));
  assert.ok(searchGraphics('photo').some(g=>g.id==='graphic-illustration-polaroid-scene'));
  assert.equal(searchGraphics('unlikely-nonexistent-query').length,0);
  assert.equal(searchGraphics('coffee','Botanical').length,0);
  assert.equal(searchGraphics('','3D illustrations').length,24,'the dedicated collection contains24 editable dimensional scenes');
  assert.ok(searchGraphics('3d').length>=24,'the Elements 3D category also finds earlier dimensional artwork');
  for(const term of ['cube','podium','telescope','butterfly','recycle','gingham','handshake'])assert.ok(searchGraphics(term).length,`${term} has a meaningful discoverable asset`);
});

test('every new graphics family actually paints finite vector geometry and survives native JSON roundtrip',async()=>{
 const {GRAPHICS}=await catalog,{StaticCanvas,Path,Group,Point,util}=await import('fabric/node');
 const canvas=new StaticCanvas(undefined,{width:240,height:240,enableRetinaScaling:false,renderOnAddRemove:false});
 const families=['3D illustrations','Business','Education','Nature & animals','Symbols','Decorative accents'];
 try{
  for(const graphic of GRAPHICS.filter(graphic=>families.includes(graphic.category))){
   canvas.clear();
   const parts=graphic.parts.map(part=>new Path(part.path,{fill:part.fill==='none'?null:part.fill,stroke:part.stroke,strokeWidth:part.strokeWidth,strokeLineCap:part.strokeLineCap,strokeLineJoin:part.strokeLineJoin,opacity:part.opacity??1}));
   const group=new Group(parts,{objectCaching:false});
   for(const [name,value]of Object.entries(group.getBoundingRect()))assert.ok(Number.isFinite(value)&&value!==Infinity,`${graphic.id} finite ${name}`);
   group.scale(Math.min(190/group.width,190/group.height));group.setPositionByOrigin(new Point(120,120),'center','center');canvas.add(group);canvas.renderAll();
   const data=canvas.getContext().getImageData(0,0,240,240).data;let painted=0;
   for(let i=3;i<data.length;i+=4)if(data[i]>0)painted++;
   assert.ok(painted>150,`${graphic.id} paints visible native artwork (${painted} pixels)`);
   assert.doesNotMatch(group.toSVG(),/<image|NaN|Infinity/);
   const [restored]=await util.enlivenObjects([group.toObject()]);
   assert.equal(restored.getObjects().length,graphic.parts.length,`${graphic.id} keeps every editable part`);
   assert.deepEqual(restored.getObjects().map(part=>[part.fill,part.stroke,part.opacity]),group.getObjects().map(part=>[part.fill,part.stroke,part.opacity]),`${graphic.id} keeps native paint`);
   restored.dispose();
  }
 }finally{await canvas.dispose();}
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
