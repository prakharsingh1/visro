const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
const luminance=color=>{const rgb=color.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
const contrast=(a,b)=>{const light=Math.max(luminance(a),luminance(b)),dark=Math.min(luminance(a),luminance(b));return (light+.05)/(dark+.05);};
const catalog=Promise.all([import('../src/templates.ts'),import('../src/template-library.ts')]);

const existingIds=['next-idea','summer-drop','wildflower-story','studio-cover','night-market','olive-note','brand-orbit','small-habits','coffee-menu','new-chapter','morning-ritual','creative-workshop','book-club-note','olive-object','open-studio-day','weekly-reset','product-release','year-in-small-moments','future-by-design','conversation-agenda','quarterly-snapshot','people-behind-work','roadmap-next-four','case-study-change','thanks-conversation','clay-and-company','jazz-after-dark','walk-a-little-further','learn-build-repeat','bakery-first-light','stories-in-the-square','garden-lunch-menu','evening-drinks-menu','architect-business-card','creative-business-card','cv-clear-path','cv-editorial-profile','birthday-good-company','wedding-garden-vows','gallery-new-perspectives','dinner-at-our-table','five-small-actions','budget-with-intention','field-notes-newsletter','creative-guide-thumbnail','certificate-quiet-achievement'];

test('650 original templates preserve existing project template identities',async()=>{
  const [{TEMPLATES,getTemplate},{ORIGINAL_TEMPLATE_LIBRARY:originals,TEMPLATE_PROVENANCE}]=await catalog;
  assert.equal(TEMPLATES.length,650);
  assert.equal(originals.length,454);
  assert.deepEqual(TEMPLATES.slice(0,46).map(t=>t.id),existingIds);
  assert.deepEqual(TEMPLATES.slice(0,500).map(t=>t.id),[...existingIds,...originals.map(t=>t.id)]);
  assert.equal(new Set(TEMPLATES.map(t=>t.id)).size,650);
  assert.equal(new Set(TEMPLATES.map(t=>t.name)).size,650);
  for(const t of TEMPLATES)assert.equal(getTemplate(t.id),t);
  assert.equal(getTemplate('does-not-exist'),undefined);
  assert.equal(TEMPLATE_PROVENANCE.requiresNetwork,false);
  assert.match(TEMPLATE_PROVENANCE.source,/Original layouts/);
});

test('new catalog covers distinct compositions and coherent subject collections',async()=>{
  const [,{ORIGINAL_TEMPLATE_LIBRARY:templates,ORIGINAL_TEMPLATE_STATS:stats}]=await catalog;
  assert.equal(stats.compositions,26);assert.equal(stats.collections,19);assert.equal(stats.categories.length,23);
  const byComposition=new Map(),byCollection=new Map();
  for(const t of templates){byComposition.set(t.composition,(byComposition.get(t.composition)||0)+1);byCollection.set(t.collection,(byCollection.get(t.collection)||0)+1);}
  assert.equal(byComposition.get('quarterly-calendar'),4);
  for(const [composition,count] of byComposition)if(composition!=='quarterly-calendar')assert.equal(count,18);
  for(const [collection,count] of byCollection)if(collection!=='THE CONSIDERED YEAR')assert.equal(count,25);
  const geometries=new Set(templates.map(t=>JSON.stringify(t.elements.map(e=>[e.type,e.x,e.y,e.width,e.height]))));
  assert.ok(geometries.size>=100,'composition and vector geometry must vary beyond palette changes');
  const typography=new Set(templates.map(t=>JSON.stringify(t.elements.map(e=>[e.type,e.x,e.y,e.width,e.height,e.fontSize,e.text?.split('\n').length]))));
  assert.ok(typography.size>=180,'font-aware text fitting must adapt to different collections');
  for(const category of ['CV','Menu','Brochure','Planner','Calendar','Worksheet','Presentation','Podcast','Infographic','Label'])assert.ok(stats.categories.includes(category));
});

test('originals are entirely editable, bounded and legible using packaged open fonts',async()=>{
  const [,{ORIGINAL_TEMPLATE_LIBRARY:templates}]=await catalog;
  const fonts=new Set(JSON.parse(readFileSync(new URL('../scripts/font-manifest.json',`file://${__filename}`))).families.map(f=>f.name));
  for(const t of templates){
    assert.ok(t.elements.length>=7&&t.elements.length<=170,t.id);
    assert.match(t.background,/^#[\da-f]{6}$/i);
    assert.equal(t.palette.length,5);
    assert.ok(contrast(t.palette[0],t.palette[1])>=7,'primary copy must remain readable on the paper');
    assert.ok(contrast(t.palette[3],t.palette[1])>=4.5,'panel copy must remain readable');
    for(const e of t.elements){
      const label=`${t.id}: ${e.text?.slice(0,50)||e.type}`;
      assert.ok(['text','rect','circle','triangle','line','star'].includes(e.type),label);
      assert.equal(e.src,undefined,label);
      for(const v of [e.x,e.y,e.width,e.height])assert.ok(Number.isFinite(v),label);
      assert.ok(e.x>=0&&e.y>=0&&e.width>0&&e.height>0,label);
      assert.ok(e.x+e.width<=t.width+1&&e.y+e.height<=t.height+1,label);
      if(e.type==='text'){
        assert.ok(fonts.has(e.fontFamily),label);
        assert.ok(e.text.trim().length>0,label);
        assert.ok(e.fontSize>=16,label);
        const required=e.fontSize*1.13*(1+(e.text.split('\n').length-1)*e.lineHeight);
        assert.ok(required<=e.height+1,label);
        assert.ok(!/lorem ipsum|your headline|sample text/i.test(e.text),label);
      }
    }
  }
});

test('calendar dates are accurate Monday-first editable objects for every month of 2027',async()=>{
  const [,{ORIGINAL_TEMPLATE_LIBRARY:templates}]=await catalog;
  const calendars=templates.filter(t=>t.category==='Calendar');
  assert.equal(calendars.length,4);
  for(const [q,calendar] of calendars.entries())for(let j=0;j<3;j++){
    const month=q*3+j,top=583+j*448;
    const dates=calendar.elements.filter(e=>e.type==='text'&&e.y>=top+181&&e.y<=top+181+5*43);
    const days=new Date(Date.UTC(2027,month+1,0)).getUTCDate();
    assert.equal(dates.length,days);
    assert.deepEqual(dates.map(e=>Number(e.text)),Array.from({length:days},(_,i)=>i+1));
    const offset=(new Date(Date.UTC(2027,month,1)).getUTCDay()+6)%7;
    for(const [i,e] of dates.entries()){
      assert.equal(e.x,89+(offset+i)%7*182);
      assert.equal(e.y,top+181+Math.floor((offset+i)/7)*43);
    }
  }
});

test('font-aware authoring wraps conservatively and preserves paragraph breaks',async()=>{
  const [,{wrapTemplateText}]=await catalog;
  assert.deepEqual(wrapTemplateText('A good idea\nA second thought',800,32,'DM Sans'),['A good idea','A second thought']);
  const wrapped=wrapTemplateText('Useful questions lead to thoughtful answers.',190,32,'Libre Baskerville',700);
  assert.ok(wrapped.length>=4);
  assert.equal(wrapped.join(' '),'Useful questions lead to thoughtful answers.');
});


test('photo editions use verified local photographs with portable provenance and varied composition',async()=>{
  const [,{PHOTO_TEMPLATE_LIBRARY:templates}]=await catalog;
  const manifest=JSON.parse(readFileSync(new URL('../public/template-photos/manifest.json',`file://${__filename}`)));
  const sources=new Map(manifest.images.map(image=>[image.file,image]));
  assert.equal(templates.length,30);assert.equal(sources.size,12);
  const categories=new Set(),geometries=new Set(),used=new Set();
  for(const template of templates){
    categories.add(template.category);
    geometries.add(JSON.stringify(template.elements.map(e=>[e.type,e.x,e.y,e.width,e.height])));
    const photos=template.elements.filter(e=>e.type==='image');
    assert.ok(photos.length>=1&&photos.length<=3,template.id);
    assert.ok(template.elements.filter(e=>e.type==='text').length>=4,template.id);
    for(const element of template.elements){
      assert.ok(element.x>=0&&element.y>=0&&element.width>0&&element.height>0,template.id);
      assert.ok(element.x+element.width<=template.width+1&&element.y+element.height<=template.height+1,template.id);
      if(element.type==='text'){
        assert.ok(element.fontSize>=16,template.id);
        assert.ok(element.fontSize*1.13*(1+(element.text.split('\n').length-1)*element.lineHeight)<=element.height+1,template.id);
      }
    }
    for(const photo of photos){
      assert.match(photo.src,/^\/template-photos\/[a-z-]+\.jpg$/);
      assert.equal(photo.imageFit,'cover');
      const image=sources.get(photo.src.split('/').at(-1));assert.ok(image);
      assert.equal(photo.source.id,`commons:${image.commonsPageId}`);
      assert.equal(photo.source.artist,image.author);assert.equal(photo.source.license,image.license);
      assert.equal(photo.source.sourceUrl,image.sourcePage);
      assert.ok(photo.source.licenseUrl.startsWith('https://'));
      used.add(image.id);
    }
  }
  assert.equal(used.size,12);assert.equal(geometries.size,30);assert.ok(categories.size>=12);
});

test('bundled photo bytes match the verified public-domain manifest without runtime downloads',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/template-photos/manifest.json',`file://${__filename}`)));
  const runtimeManifest=JSON.parse(readFileSync(new URL('../src/template-photo-manifest.json',`file://${__filename}`)));
  assert.deepEqual(runtimeManifest,manifest,'runtime and distributed photo provenance must stay identical');
  let bytes=0;
  for(const image of manifest.images){
    const data=readFileSync(new URL(`../public/template-photos/${image.file}`,`file://${__filename}`));
    assert.equal(data[0],0xff);assert.equal(data[1],0xd8,'a photo must be an actual JPEG');
    assert.equal(data.byteLength,image.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),image.sha256);
    assert.ok(image.width<=1200&&image.height<=1200&&image.width>=600&&image.height>=600);
    assert.ok(data.byteLength<=330000);bytes+=data.byteLength;
    assert.ok(['CC0','Public domain'].includes(image.license));assert.equal(image.attributionRequired,false);
    assert.ok(Number.isInteger(image.commonsPageId)&&image.commonsPageId>0);
    assert.match(image.sourcePage,/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.match(image.downloadUrl,/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//);
    if(image.license==='CC0')assert.ok(image.licenseUrl.includes('/publicdomain/zero/1.0/'));
    else assert.equal(image.copyrightStatus.toLowerCase(),'false');
  }
  assert.ok(bytes<5*1024*1024);
});
