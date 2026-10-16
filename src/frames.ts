/** Original frame masks and photo-grid layouts. Geometry is independent of image bytes. */
export type FrameCategory='Basic'|'Geometric'|'Organic'|'Decorative';
export interface FrameDefinition {
  kind:'frame';id:string;name:string;category:FrameCategory;tags:readonly string[];
  /** Display width / height. Paths always use the normalized 0..100 square. */
  aspectRatio:number;path:string;fillRule:'nonzero'|'evenodd';
}
export interface FrameSlot {x:number;y:number;width:number;height:number}
export interface FrameGridDefinition {
  kind:'grid';id:string;name:string;category:'Photo grids';tags:readonly string[];
  aspectRatio:number;slots:readonly FrameSlot[];
}
export type FrameLibraryItem=FrameDefinition|FrameGridDefinition;
const rounded='M15 0 H85 Q100 0 100 15 V85 Q100 100 85 100 H15 Q0 100 0 85 V15 Q0 0 15 0 Z';
const rectangle='M0 0 H100 V100 H0 Z';
const circle='M100 50 A50 50 0 1 1 0 50 A50 50 0 1 1 100 50 Z';
const n=(value:number)=>Math.round(value*10000)/10000;
const polygon=(points:readonly (readonly number[])[])=>points.map(([x,y],i)=>`${i?'L':'M'}${n(x)} ${n(y)}`).join(' ')+' Z';
const regular=(count:number,rotation=-Math.PI/2)=>Array.from({length:count},(_,i)=>[50+50*Math.cos(rotation+i*Math.PI*2/count),50+50*Math.sin(rotation+i*Math.PI*2/count)]);
const star=(tips:number,inner=.5)=>polygon(Array.from({length:tips*2},(_,i)=>{const angle=-Math.PI/2+i*Math.PI/tips,r=i%2?50*inner:50;return[50+Math.cos(angle)*r,50+Math.sin(angle)*r];}));
const scallop=(petals:number,inner:number)=>{const points=Array.from({length:petals*2},(_,i)=>{const angle=-Math.PI/2+i*Math.PI/petals,r=i%2?50:inner;return[50+Math.cos(angle)*r,50+Math.sin(angle)*r];});let path=`M${n((points[0][0]+points.at(-1)![0])/2)} ${n((points[0][1]+points.at(-1)![1])/2)}`;for(let i=0;i<points.length;i++){const point=points[i],next=points[(i+1)%points.length];path+=` Q${n(point[0])} ${n(point[1])} ${n((point[0]+next[0])/2)} ${n((point[1]+next[1])/2)}`;}return path+' Z';};
function frame(id:string,name:string,category:FrameCategory,path:string,aspectRatio=1,tags:readonly string[]=[],fillRule:FrameDefinition['fillRule']='nonzero'):FrameDefinition{return{kind:'frame',id,name,category,path,aspectRatio,tags:[category.toLowerCase(),...tags],fillRule};}

export const FRAME_LIBRARY:readonly FrameDefinition[]=[
  frame('square','Square','Basic',rectangle,1,['rectangle','simple']),
  frame('landscape','Landscape','Basic',rectangle,1.5,['rectangle','wide','horizontal']),
  frame('portrait','Portrait','Basic',rectangle,.75,['rectangle','tall','vertical']),
  frame('rounded','Rounded square','Basic',rounded,1,['soft','rectangle']),
  frame('rounded-wide','Rounded landscape','Basic',rounded,1.6,['soft','wide','rectangle']),
  frame('circle','Circle','Basic',circle,1,['round','profile','avatar']),
  frame('ellipse','Oval','Basic',circle,1.5,['ellipse','wide','round']),
  frame('pill','Pill','Basic','M25 0 H75 A25 50 0 0 1 75 100 H25 A25 50 0 0 1 25 0 Z',2,['capsule','wide','rounded']),
  // These four legacy IDs retain their existing normalized mask geometry.
  frame('arch','Arch','Basic','M0 100 L0 50 Q0 0 50 0 Q100 0 100 50 L100 100 Z',.8,['window','arched']),
  frame('reverse-arch','Inverted arch','Basic','M0 0 H100 V50 Q100 100 50 100 Q0 100 0 50 Z',.8,['window','arched','upside-down']),
  frame('tall-arch','Tall arch','Basic','M0 100 V32 Q0 0 50 0 Q100 0 100 32 V100 Z',.65,['window','portrait']),
  frame('diamond','Diamond','Geometric',polygon([[50,0],[100,50],[50,100],[0,50]]),1,['rhombus']),
  frame('triangle','Triangle','Geometric',polygon([[50,0],[100,100],[0,100]]),1,['three','point']),
  frame('hexagon','Hexagon','Geometric',polygon(regular(6,0)),1,['six','honeycomb']),
  frame('octagon','Octagon','Geometric',polygon(regular(8,Math.PI/8)),1,['eight','polygon']),
  frame('pentagon','Pentagon','Geometric',polygon(regular(5)),1,['five','polygon']),
  frame('shield','Shield','Geometric','M0 0 H100 V47 C100 73 78 92 50 100 C22 92 0 73 0 47 Z',.85,['badge','crest']),
  frame('parallelogram','Slanted rectangle','Geometric',polygon([[24,0],[100,0],[76,100],[0,100]]),1.3,['parallelogram','tilted']),
  frame('heart','Heart','Organic','M50 100 C33 83 0 59 0 29 C0 1 34 -8 50 19 C66 -8 100 1 100 29 C100 59 67 83 50 100 Z',1,['love','valentine']),
  frame('teardrop','Teardrop','Organic','M50 0 C39 23 0 55 0 72 C0 109.3333 100 109.3333 100 72 C100 55 61 23 50 0 Z',.8,['drop','water']),
  frame('leaf','Leaf','Organic','M0 100 C0 30 26 0 100 0 C100 69 73 100 0 100 Z',1,['botanical','natural']),
  frame('petal','Petal','Organic','M50 0 C116 20 116 78 50 100 C-16 78 -16 20 50 0 Z',.8,['flower','natural']),
  frame('squircle','Squircle','Organic','M50 0 C90 0 100 10 100 50 C100 90 90 100 50 100 C10 100 0 90 0 50 C0 10 10 0 50 0 Z',1,['soft','rounded']),
  frame('organic-blob','Organic blob','Organic','M48 1 C68 5 91 -2 97 24 C105 45 89 52 94 73 C99 93 69 104 49 97 C25 102 0 85 4 65 C-5 44 5 13 27 9 C35 0 40 0 48 1 Z',1,['abstract','fluid']),
  frame('pebble','Pebble','Organic','M34 1 C68 -5 103 26 98 57 C98 84 72 103 43 99 C16 100 -4 80 1 53 C1 27 12 6 34 1 Z',1.1,['stone','natural']),
  frame('flower','Flower','Organic',scallop(6,26),1,['petals','floral']),
  frame('scalloped','Scalloped circle','Decorative',scallop(16,43),1,['seal','badge','round']),
  frame('star','Star','Decorative',star(5,.48),1,['five','point','celebration']),
  frame('burst','Sunburst','Decorative',star(18,.82),1,['badge','seal','rays']),
  frame('ticket','Ticket','Decorative','M0 0 H100 V32 C76 32 76 68 100 68 V100 H0 V68 C24 68 24 32 0 32 Z',1.5,['coupon','notched']),
  frame('tag','Gift tag','Decorative',polygon([[0,0],[71,0],[100,50],[71,100],[0,100]]),1.35,['label','pointed']),
  frame('speech','Speech bubble','Decorative','M10 0 H90 Q100 0 100 10 V70 Q100 80 90 80 H40 L16 100 V80 H10 Q0 80 0 70 V10 Q0 0 10 0 Z',1.2,['chat','callout']),
  frame('oval-speech','Round speech bubble','Decorative','M50 0 C80 0 100 15 100 39 C100 63 77 78 49 78 H40 L13 100 L21 69 C7 62 0 53 0 39 C0 15 20 0 50 0 Z',1.2,['chat','callout','oval']),
  frame('moon','Crescent','Decorative','M78 0 A50 50 0 1 0 78 100 C31 88 31 12 78 0 Z',.8,['moon','night']),
  frame('ring','Ring','Decorative',circle+' M72 50 A22 22 0 1 1 28 50 A22 22 0 1 1 72 50 Z',1,['donut','circle','cutout'],'evenodd'),
  frame('four-panes','Four-pane window','Decorative','M0 0 H47 V47 H0 Z M53 0 H100 V47 H53 Z M0 53 H47 V100 H0 Z M53 53 H100 V100 H53 Z',1,['window','panes','split']),
];
const rect=(x:number,y:number,width:number,height:number):FrameSlot=>({x,y,width,height});
function matrix(columns:number,rows:number):FrameSlot[]{return Array.from({length:rows*columns},(_,i)=>rect((i%columns)/columns,Math.floor(i/columns)/rows,1/columns,1/rows));}
function grid(id:string,name:string,aspectRatio:number,slots:readonly FrameSlot[],tags:readonly string[]=[]):FrameGridDefinition{return{kind:'grid',id:`grid-${id}`,name,category:'Photo grids',tags:[`${slots.length} photos`,`${slots.length} images`,'collage',...tags],aspectRatio,slots};}
export const FRAME_GRIDS:readonly FrameGridDefinition[]=[
  grid('single','Single photo',1,matrix(1,1),['one']),
  grid('two-columns','Two columns',1.5,matrix(2,1),['pair','side by side']),
  grid('two-rows','Two rows',1,matrix(1,2),['pair','stacked']),
  grid('two-feature','Two-photo feature',1.5,[rect(0,0,.65,1),rect(.65,0,.35,1)],['hero','large left']),
  grid('two-banner','Two-photo banner',1.5,[rect(0,0,1,.65),rect(0,.65,1,.35)],['hero','large top']),
  grid('three-columns','Three columns',1.5,matrix(3,1),['triptych']),
  grid('three-rows','Three rows',.8,matrix(1,3),['stacked']),
  grid('three-feature-left','Three-photo feature left',1.3,[rect(0,0,.6,1),rect(.6,0,.4,.5),rect(.6,.5,.4,.5)],['hero']),
  grid('three-feature-top','Three-photo feature top',1,[rect(0,0,1,.6),rect(0,.6,.5,.4),rect(.5,.6,.5,.4)],['hero']),
  grid('three-center','Three-photo center feature',1.6,[rect(0,0,.25,1),rect(.25,0,.5,1),rect(.75,0,.25,1)],['triptych','hero']),
  grid('four-square','Four-photo square',1,matrix(2,2),['classic']),
  grid('four-columns','Four columns',1.8,matrix(4,1),['strip']),
  grid('four-rows','Four rows',.75,matrix(1,4),['strip','stacked']),
  grid('four-feature','Four-photo feature',1.4,[rect(0,0,.6,1),rect(.6,0,.4,1/3),rect(.6,1/3,.4,1/3),rect(.6,2/3,.4,1/3)],['hero']),
  grid('four-masonry','Four-photo stagger',1,[rect(0,0,.5,.6),rect(0,.6,.5,.4),rect(.5,0,.5,.35),rect(.5,.35,.5,.65)],['masonry','editorial']),
  grid('five-feature','Five-photo feature',1.4,[rect(0,0,.6,1),rect(.6,0,.2,.5),rect(.8,0,.2,.5),rect(.6,.5,.2,.5),rect(.8,.5,.2,.5)],['hero']),
  grid('five-columns','Five columns',2,matrix(5,1),['strip']),
  grid('five-editorial','Five-photo editorial',1.2,[rect(0,0,1/3,.4),rect(1/3,0,1/3,.4),rect(2/3,0,1/3,.4),rect(0,.4,.5,.6),rect(.5,.4,.5,.6)],['magazine']),
  grid('six-landscape','Six-photo landscape',1.5,matrix(3,2),['classic']),
  grid('six-portrait','Six-photo portrait',.8,matrix(2,3),['classic']),
  grid('seven-feature','Seven-photo feature',1.4,[rect(0,0,.6,1),...matrix(2,3).map(s=>rect(.6+s.x*.4,s.y,s.width*.4,s.height))],['hero']),
  grid('eight-landscape','Eight-photo landscape',1.6,matrix(4,2),['classic']),
  grid('eight-portrait','Eight-photo portrait',.75,matrix(2,4),['classic']),
  grid('nine-square','Nine-photo square',1,matrix(3,3),['classic']),
];
export const FRAME_ITEMS:readonly FrameLibraryItem[]=[...FRAME_LIBRARY,...FRAME_GRIDS];
export const FRAMES_PROVENANCE={author:'Visro contributors',license:'AGPL-3.0-only',source:'Independently authored vector masks and normalized photo-grid layouts',networkRequired:false} as const;
export function getFrameDefinition(id:string):FrameDefinition|undefined{return FRAME_LIBRARY.find(frame=>frame.id===id);}
export function getGridDefinition(id:string):FrameGridDefinition|undefined{return FRAME_GRIDS.find(grid=>grid.id===id);}
export function getFrameLibraryItem(id:string):FrameLibraryItem|undefined{return FRAME_ITEMS.find(item=>item.id===id);}
export function searchFrames(query='',category='All'):FrameLibraryItem[]{const terms=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);return FRAME_ITEMS.filter(item=>(category==='All'||item.category===category)&&(terms.every(term=>[item.name,item.category,item.kind==='frame'?'frame photo picture':'grid photos pictures',...item.tags].join(' ').toLocaleLowerCase().includes(term))));}
/** Gap is in document pixels. Only internal edges are inset; the outer perimeter stays flush. */
export function resolveGridSlots(grid:FrameGridDefinition,width:number,height:number,gap=12):FrameSlot[]{
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!Number.isFinite(gap)||gap<0)throw new Error('Use positive grid dimensions and a nonnegative gap.');
  return grid.slots.map(slot=>{const left=slot.x>1e-8?gap/2:0,top=slot.y>1e-8?gap/2:0,right=slot.x+slot.width<1-1e-8?gap/2:0,bottom=slot.y+slot.height<1-1e-8?gap/2:0;const rect={x:slot.x*width+left,y:slot.y*height+top,width:slot.width*width-left-right,height:slot.height*height-top-bottom};if(rect.width<=0||rect.height<=0)throw new Error('The gap is too large for this photo grid.');return rect;});
}
/** Shared, original sky-and-hills artwork. This markup has no fonts, images or external resources. */
export const FRAME_PLACEHOLDER_ART='<rect width="100" height="100" fill="#bed9ec"/><circle cx="74" cy="25" r="10" fill="#fff7d6"/><path d="M0 68 Q17 40 40 67 Q60 88 100 49 V100 H0 Z" fill="#8fb899"/><path d="M0 83 Q27 62 52 81 Q77 101 100 74 V100 H0 Z" fill="#567d65"/>';
const escapeXML=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!));
export function framePreviewSVG(item:FrameLibraryItem,idPrefix='frame-preview'):string{
  const clipId=escapeXML(`${idPrefix}-${item.id}`),title=escapeXML(item.name),height=100/item.aspectRatio;
  if(item.kind==='frame')return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 ${height}" role="img" aria-label="${title}"><defs><clipPath id="${clipId}"><path transform="scale(1 ${1/item.aspectRatio})" d="${item.path}" fill-rule="${item.fillRule}" clip-rule="${item.fillRule}"/></clipPath></defs><g clip-path="url(#${clipId})"><svg width="100" height="${height}" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">${FRAME_PLACEHOLDER_ART}</svg></g></svg>`;
  const width=100,slots=resolveGridSlots(item,width,height,3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">${slots.map((slot,index)=>`<svg x="${slot.x}" y="${slot.y}" width="${slot.width}" height="${slot.height}" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">${FRAME_PLACEHOLDER_ART.replaceAll('cx="74"',`cx="${62+index%3*9}"`)}</svg>`).join('')}</svg>`;
}
