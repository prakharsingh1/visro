const { test } = require('node:test');
const assert = require('node:assert/strict');

const projectModule = import('../src/project.ts');

test('project round trip preserves multiple pages, image sources, and branding', async () => {
  const { createProject, parseProject, stringifyProject } = await projectModule;
  const project = createProject('Launch concept', 1920, 1080, '#FAF5EC');
  project.pages[0].canvas.objects.push({ type: 'Image', id: 'hero-photo', src: 'data:image/png;base64,example', left: 24, top: 40, filters: [{ type: 'Brightness', brightness: 0.1 }] });
  project.pages.push({ id: 'page-2', name: 'Details', background: '#292620', canvas: { objects: [{ type: 'Textbox', text: 'A new idea', fontFamily: 'Georgia' }] } });
  project.activePageId = 'page-2';
  const reopened = parseProject(stringifyProject(project));
  assert.deepEqual(reopened, project);
  reopened.pages[0].canvas.objects[0].left = 900;
  assert.equal(project.pages[0].canvas.objects[0].left, 24, 'deserialization must not share mutable objects');
});

test('project import rejects unsupported versions, damaged page IDs, and unsafe dimensions', async () => {
  const { createProject, validateProject } = await projectModule;
  const project = createProject();
  assert.throws(() => validateProject({ ...project, version: 2 }), /unsupported file version/);
  assert.throws(() => validateProject({ ...project, width: NaN }), /width/);
  assert.throws(() => validateProject({ ...project, height: 8193 }), /height/);
  assert.throws(() => validateProject({ ...project, pages: [] }), /between 1 and 100/);
  assert.throws(() => validateProject({ ...project, pages: [project.pages[0], project.pages[0]] }), /unique ID/);
  assert.throws(() => validateProject({ ...project, activePageId: 'missing' }), /active page/);
  assert.throws(() => validateProject({ ...project, pages: [{ ...project.pages[0], canvas: { objects: [{ text: 'missing type' }] } }] }), /invalid layer/);
});

test('older branding omissions open safely without changing document content', async () => {
  const { createProject, validateProject, parseProject } = await projectModule;
  const project = createProject();
  delete project.brand;
  const opened = validateProject(project);
  assert.deepEqual(opened.brand, { colors: [], fonts: [] });
  assert.equal(opened.pages.length, 1);
  assert.throws(() => parseProject('{broken'), /invalid JSON/);
});

test('page guides survive a portable round trip and imported guides are bounded', async () => {
  const { createProject, validateProject, parseProject, stringifyProject } = await projectModule;
  const project=createProject('Guided layout',1200,900);
  project.pages[0].metadata={notes:'Keep the title inside the guides.',guides:{x:[0,400,800,1200],y:[40,450,860]}};
  assert.deepEqual(parseProject(stringifyProject(project)).pages[0].metadata,project.pages[0].metadata);
  project.pages[0].metadata.guides={x:[-1,Infinity,'12',NaN,1201,30],y:Array.from({length:150},(_,i)=>i)};
  const opened=validateProject(project);
  assert.deepEqual(opened.pages[0].metadata.guides.x,[30]);
  assert.equal(opened.pages[0].metadata.guides.y.length,100);
  assert.equal(project.pages[0].metadata.guides.y.length,150,'validation must not mutate the source file');
  for(const guides of [null,false,17,'invalid',{x:null,y:'invalid'}]){
    project.pages[0].metadata.guides=guides;
    assert.deepEqual(validateProject(project).pages[0].metadata.guides,{x:[],y:[]},'malformed guides must open without crashing the editor');
  }
});

test('original template catalog has unique IDs and valid logical-pixel content', async () => {
  const { TEMPLATES } = await import('../src/templates.ts');
  assert.ok(TEMPLATES.length >= 9);
  assert.equal(new Set(TEMPLATES.map((template) => template.id)).size, TEMPLATES.length);
  for (const template of TEMPLATES) {
    assert.ok(template.width >= 16 && template.height >= 16);
    assert.ok(template.elements.length > 3);
    assert.ok(template.palette.length >= 3);
    for (const element of template.elements) {
      assert.ok(Number.isFinite(element.x) && Number.isFinite(element.y));
      if (element.type === 'text') assert.ok(element.text && element.fontSize > 0);
    }
  }
});

test('public photo provenance survives project files without allowing untrusted source links',async()=>{
 const {sanitizeElementMetadata,createProject,parseProject,stringifyProject}=await projectModule;
 const source={id:'commons:123',title:'File:Photo.jpg',artist:'Author',license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',sourceUrl:'https://commons.wikimedia.org/wiki/File:Photo.jpg'};
 const project=createProject();project.pages[0].canvas.objects.push({type:'Image',src:'data:image/png;base64,AAAA',visroMetadata:{source}});
 assert.deepEqual(parseProject(stringifyProject(project)).pages[0].canvas.objects[0].visroMetadata.source,source);
 assert.equal(sanitizeElementMetadata({source:{...source,sourceUrl:'https://127.0.0.1/private'}}).source,undefined);
 assert.equal(sanitizeElementMetadata({source:{...source,license:'CC BY-NC'}}).source,undefined);
});
