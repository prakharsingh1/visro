/** Original, native-vector shape geometry. All paths/points use a 100-unit box. */
export interface ShapePoint {x:number;y:number}
export type ShapeCategory = 'Basic'|'Polygons'|'Stars & badges'|'Arrows'|'Callouts'|'Lines';
interface ShapeBase {id:string;name:string;category:ShapeCategory;aspectRatio:number;path:string;filled:boolean;strokeWidth:number;dash?:readonly number[];lineCap?:'round'|'butt'}
export type ShapeGeometry =
  | ShapeBase & {kind:'polygon';points:ShapePoint[]}
  | ShapeBase & {kind:'path'}
  | ShapeBase & {kind:'line';points:[number,number,number,number]};

const n=(value:number)=>Math.round(value*10000)/10000;
const point=(x:number,y:number):ShapePoint=>({x:n(x),y:n(y)});
const regular=(sides:number,rotation=-Math.PI/2)=>Array.from({length:sides},(_,i)=>point(50+50*Math.cos(rotation+i*Math.PI*2/sides),50+50*Math.sin(rotation+i*Math.PI*2/sides)));
const star=(tips:number,inner=.45)=>Array.from({length:tips*2},(_,i)=>{const radius=i%2?50*inner:50,angle=-Math.PI/2+i*Math.PI/tips;return point(50+radius*Math.cos(angle),50+radius*Math.sin(angle));});
const polygonPath=(points:readonly ShapePoint[])=>points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')+' Z';
const pairs=(values:readonly number[])=>Array.from({length:values.length/2},(_,i)=>point(values[i*2],values[i*2+1]));
function polygon<const I extends string>(id:I,name:string,category:ShapeCategory,points:ShapePoint[],aspectRatio=1) {
  return{id,name,category,aspectRatio,kind:'polygon' as const,points,path:polygonPath(points),filled:true,strokeWidth:0};
}
function pathShape<const I extends string>(id:I,name:string,category:ShapeCategory,path:string,aspectRatio=1) {
  return{id,name,category,aspectRatio,kind:'path' as const,path,filled:true,strokeWidth:0};
}
function strokeShape<const I extends string>(id:I,name:string,path:string,aspectRatio=4,dash?:readonly number[]) {
  return{id,name,category:'Lines' as const,aspectRatio,kind:'path' as const,path,filled:false,strokeWidth:3,lineCap:'round' as const,...(dash?{dash}:{})};
}
function line<const I extends string>(id:I,name:string,dash?:readonly number[]) {
  return{id,name,category:'Lines' as const,aspectRatio:4,kind:'line' as const,points:[0,50,100,50] as [number,number,number,number],path:'M0 50 L100 50',filled:false,strokeWidth:3,lineCap:'round' as const,...(dash?{dash}:{})};
}
const rightArrow=pairs([0,32,60,32,60,0,100,50,60,100,60,68,0,68]);

export const SHAPE_LIBRARY = [
  polygon('rect','Rectangle','Basic',pairs([0,0,100,0,100,100,0,100])),
  pathShape('rounded-rect','Rounded rectangle','Basic','M16 0 H84 Q100 0 100 16 V84 Q100 100 84 100 H16 Q0 100 0 84 V16 Q0 0 16 0 Z',1.3),
  pathShape('circle','Circle','Basic','M100 50 A50 50 0 1 1 0 50 A50 50 0 1 1 100 50 Z'),
  pathShape('ellipse','Ellipse','Basic','M100 50 A50 50 0 1 1 0 50 A50 50 0 1 1 100 50 Z',1.5),
  polygon('triangle','Triangle','Basic',pairs([50,0,100,100,0,100])),
  polygon('right-triangle','Right triangle','Basic',pairs([0,0,100,100,0,100])),
  polygon('diamond','Diamond','Basic',pairs([50,0,100,50,50,100,0,50])),
  polygon('parallelogram','Parallelogram','Basic',pairs([24,0,100,0,76,100,0,100]),1.5),
  polygon('trapezoid','Trapezoid','Basic',pairs([24,0,76,0,100,100,0,100]),1.3),
  pathShape('heart','Heart','Basic','M50 94 C8 66 0 43 4 25 C8 4 36 0 50 24 C64 0 92 4 96 25 C100 43 92 66 50 94 Z'),
  pathShape('moon','Crescent moon','Basic','M79 5 A48 48 0 1 0 79 95 C40 90 40 10 79 5 Z',.8),
  pathShape('teardrop','Teardrop','Basic','M50 0 C40 21 10 44 10 65 A40 35 0 0 0 90 65 C90 44 60 21 50 0 Z',.8),
  pathShape('arch','Arch','Basic','M0 100 V50 A50 50 0 0 1 100 50 V100 Z',.8),
  pathShape('semicircle','Semicircle','Basic','M0 100 A50 100 0 0 1 100 100 Z',2),
  pathShape('donut','Ring','Basic','M100 50 A50 50 0 1 1 0 50 A50 50 0 1 1 100 50 Z M72 50 A22 22 0 1 0 28 50 A22 22 0 1 0 72 50 Z'),
  polygon('plus','Plus','Basic',pairs([34,0,66,0,66,34,100,34,100,66,66,66,66,100,34,100,34,66,0,66,0,34,34,34])),
  polygon('cross','Cross','Basic',pairs([15,0,50,35,85,0,100,15,65,50,100,85,85,100,50,65,15,100,0,85,35,50,0,15])),
  polygon('lightning','Lightning bolt','Basic',pairs([56,0,9,58,44,58,33,100,92,35,57,35]),.65),
  pathShape('blob','Organic blob','Basic','M72 5 C99 8 105 35 94 59 C87 78 74 99 51 97 C25 96 1 79 4 55 C6 30 30 0 50 4 C59 6 64 4 72 5 Z'),

  polygon('pentagon','Pentagon','Polygons',regular(5)),
  polygon('hexagon','Hexagon','Polygons',regular(6,0)),
  polygon('heptagon','Heptagon','Polygons',regular(7)),
  polygon('octagon','Octagon','Polygons',regular(8,Math.PI/8)),
  polygon('nonagon','Nonagon','Polygons',regular(9)),
  polygon('decagon','Decagon','Polygons',regular(10)),
  polygon('dodecagon','Dodecagon','Polygons',regular(12,Math.PI/12)),

  polygon('star','Five-point star','Stars & badges',star(5,.43)),
  polygon('star4','Four-point star','Stars & badges',star(4,.28)),
  polygon('star6','Six-point star','Stars & badges',star(6,.5)),
  polygon('star8','Eight-point star','Stars & badges',star(8,.5)),
  polygon('star12','Twelve-point star','Stars & badges',star(12,.65)),
  polygon('star16','Sixteen-point star','Stars & badges',star(16,.75)),
  polygon('burst24','Sunburst badge','Stars & badges',star(24,.82)),
  polygon('seal','Scalloped badge','Stars & badges',star(18,.93)),

  polygon('arrow','Right arrow','Arrows',rightArrow,1.8),
  polygon('left-arrow','Left arrow','Arrows',rightArrow.map(p=>point(100-p.x,p.y)),1.8),
  polygon('up-arrow','Up arrow','Arrows',rightArrow.map(p=>point(p.y,100-p.x)),.6),
  polygon('down-arrow','Down arrow','Arrows',rightArrow.map(p=>point(p.y,p.x)),.6),
  polygon('double-arrow','Double arrow','Arrows',pairs([0,50,28,0,28,32,72,32,72,0,100,50,72,100,72,68,28,68,28,100]),2),
  polygon('chevron','Chevron','Arrows',pairs([0,0,55,0,100,50,55,100,0,100,45,50]),1.25),
  pathShape('double-chevron','Double chevron','Arrows','M0 0 H22 L55 50 L22 100 H0 L33 50 Z M45 0 H67 L100 50 L67 100 H45 L78 50 Z',1.5),
  polygon('bent-arrow','Bent arrow','Arrows',pairs([0,100,0,20,58,20,58,0,100,36,58,72,58,50,30,50,30,100])),
  pathShape('u-turn-arrow','U-turn arrow','Arrows','M0 100 V40 A40 40 0 0 1 80 40 V58 H100 L65 100 L30 58 H50 V40 A10 10 0 0 0 30 40 V100 Z'),
  pathShape('circular-arrow','Circular arrow','Arrows','M79.6985 79.6985 A42 42 0 1 1 79.6985 20.3015 L89.598 10.402 L88.184 40.101 L58.485 41.515 L68.3848 31.6152 A26 26 0 1 0 68.3848 68.3848 Z'),

  pathShape('speech-bubble','Speech bubble','Callouts','M8 0 H92 Q100 0 100 8 V65 Q100 73 92 73 H42 L18 100 V73 H8 Q0 73 0 65 V8 Q0 0 8 0 Z',1.3),
  pathShape('round-speech','Round speech bubble','Callouts','M50 0 C80 0 100 15 100 37 C100 59 80 75 50 75 H42 L16 100 L21 66 C7 59 0 49 0 37 C0 15 20 0 50 0 Z',1.4),
  pathShape('thought-bubble','Thought bubble','Callouts','M19 15 C13 0 35 0 43 9 C54 0 71 2 74 13 C93 10 105 28 93 42 C103 57 84 73 70 67 C60 80 40 77 35 68 C15 77 0 63 6 48 C-5 36 3 20 19 15 Z M24 84 A7 7 0 1 1 10 84 A7 7 0 1 1 24 84 Z M8 97 A3 3 0 1 1 2 97 A3 3 0 1 1 8 97 Z',1.25),
  pathShape('cloud','Cloud','Callouts','M20 100 A20 24 0 0 1 12 54 A22 26 0 0 1 40 19 A24 28 0 0 1 84 31 A19 23 0 0 1 90 75 A14 18 0 0 1 78 100 Z',1.6),

  line('line','Line'),
  line('dashed-line','Dashed line',[10,7]),
  line('dotted-line','Dotted line',[.1,8]),
  strokeShape('arrow-line','Arrow line','M0 50 H98 M86 38 L98 50 L86 62',4),
  strokeShape('double-arrow-line','Double arrow line','M2 50 H98 M14 38 L2 50 L14 62 M86 38 L98 50 L86 62',4),
  strokeShape('elbow-line','Elbow line','M0 0 H50 V100 H100',1.3),
  strokeShape('curved-line','Curved line','M0 100 C0 15 100 85 100 0',1.8),
  strokeShape('wavy-line','Wavy line','M0 50 C12 0 24 0 36 50 S60 100 72 50 S88 0 100 50',4),
] as const;

export type ShapeId = typeof SHAPE_LIBRARY[number]['id'];
export const SHAPE_CATEGORIES:readonly ShapeCategory[] = ['Basic','Polygons','Stars & badges','Arrows','Callouts','Lines'];
export function getShapeDefinition(id:string) {return SHAPE_LIBRARY.find(shape=>shape.id===id);}
export function getShapeGeometry(id:string):ShapeGeometry {
  const shape=getShapeDefinition(id);
  if(!shape)throw new Error(`Unknown shape: ${id}`);
  if(shape.kind==='polygon')return{...shape,points:shape.points.map(p=>({...p}))};
  if(shape.kind==='line')return{...shape,points:[...shape.points]};
  return{...shape};
}
export function shapePreviewSVG(id:string,fill='#252a32',stroke=fill):string {
  const shape=getShapeGeometry(id),color=(value:string)=>/^(?:#[0-9a-f]{3,8}|currentColor|none)$/i.test(value);
  if(!color(fill)||!color(stroke))throw new Error('Use a solid preview colour.');
  const height=n(100/shape.aspectRatio),dash=shape.dash?` stroke-dasharray="${shape.dash.join(' ')}"`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="${height}" viewBox="-3 -3 106 ${height+6}" aria-hidden="true"><path d="${shape.path}" transform="scale(1 ${n(1/shape.aspectRatio)})" fill="${shape.filled?fill:'none'}" stroke="${shape.filled?'none':stroke}" stroke-width="${shape.strokeWidth}" vector-effect="non-scaling-stroke" stroke-linecap="${shape.lineCap||'round'}" stroke-linejoin="round"${dash}/></svg>`;
}
