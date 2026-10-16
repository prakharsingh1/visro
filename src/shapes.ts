/** Original, native-vector shape geometry. All paths/points use a 100-unit box. */
export interface ShapePoint {x:number;y:number}
export type ShapeCategory = 'Basic'|'Polygons'|'Stars & badges'|'Arrows'|'Callouts'|'Lines'|'Organic'|'Flowchart';
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

  // Independently drawn silhouettes, kept as native polygons and compound paths.
  pathShape('squircle','Squircle','Basic','M50 0 C92 0 100 8 100 50 C100 92 92 100 50 100 C8 100 0 92 0 50 C0 8 8 0 50 0 Z'),
  pathShape('capsule','Capsule','Basic','M25 0 H75 A25 50 0 0 1 75 100 H25 A25 50 0 0 1 25 0 Z',2),
  pathShape('rounded-triangle','Rounded triangle','Basic','M42 8 Q50 -5 58 8 L97 83 Q106 100 87 100 H13 Q-6 100 3 83 Z'),
  pathShape('quarter-circle','Quarter circle','Basic','M0 0 A100 100 0 0 1 100 100 H0 Z'),
  pathShape('quarter-ring','Quarter ring','Basic','M0 0 A100 100 0 0 1 100 100 H72 A72 72 0 0 0 0 28 Z'),
  pathShape('half-ring','Half ring','Basic','M0 100 A50 100 0 0 1 100 100 H78 A28 56 0 0 0 22 100 Z',2),
  pathShape('rectangle-frame','Rectangle frame','Basic','M0 0 H100 V100 H0 Z M15 15 V85 H85 V15 Z',1.3),
  polygon('beveled-rectangle','Beveled rectangle','Basic',pairs([14,0,86,0,100,14,100,86,86,100,14,100,0,86,0,14]),1.4),
  polygon('cut-corner','Cut corner rectangle','Basic',pairs([0,0,70,0,100,30,100,100,0,100]),1.25),
  pathShape('folder-tab','Folder tab','Basic','M0 16 Q0 8 8 8 H37 L48 24 H92 Q100 24 100 32 V92 Q100 100 92 100 H8 Q0 100 0 92 Z',1.3),
  pathShape('shield','Shield','Basic','M0 0 H100 V49 Q100 81 50 100 Q0 81 0 49 Z',.85),
  pathShape('ticket','Ticket','Basic','M0 0 H100 V27 A18 23 0 0 0 100 73 V100 H0 V73 A18 23 0 0 0 0 27 Z',1.8),

  polygon('kite','Kite','Polygons',pairs([50,0,100,35,50,100,0,35]),.8),
  polygon('rhomboid','Rhomboid','Polygons',pairs([38,0,100,28,62,100,0,72]),1.2),
  polygon('hexagon-pointed','Pointed hexagon','Polygons',pairs([50,0,100,24,100,76,50,100,0,76,0,24]),.8),
  polygon('concave-hexagon','Concave hexagon','Polygons',pairs([0,0,100,0,70,50,100,100,0,100,30,50]),1.4),
  polygon('hendecagon','Eleven-sided polygon','Polygons',regular(11)),
  polygon('tetradecagon','Fourteen-sided polygon','Polygons',regular(14)),
  polygon('hexadecagon','Sixteen-sided polygon','Polygons',regular(16,Math.PI/16)),
  polygon('icosagon','Twenty-sided polygon','Polygons',regular(20,Math.PI/20)),

  polygon('star3','Three-point star','Stars & badges',star(3,.3)),
  polygon('star7','Seven-point star','Stars & badges',star(7,.45)),
  polygon('star9','Nine-point star','Stars & badges',star(9,.5)),
  polygon('star10','Ten-point star','Stars & badges',star(10,.48)),
  polygon('star20','Twenty-point star','Stars & badges',star(20,.62)),
  polygon('burst32','Thirty-two-point burst','Stars & badges',star(32,.83)),
  polygon('burst48','Fine burst','Stars & badges',star(48,.88)),
  polygon('sparkle-long','Long sparkle','Stars & badges',pairs([50,0,58,40,100,50,58,60,50,100,42,60,0,50,42,40]),.7),
  pathShape('asterisk','Six-arm asterisk','Stars & badges','M43 0 H57 V35 L87 17 L94 29 L64 47 L94 65 L87 77 L57 59 V94 H43 V59 L13 77 L6 65 L36 47 L6 29 L13 17 L43 35 Z'),
  pathShape('award-ribbon','Award ribbon','Stars & badges','M17 53 H83 L95 100 L63 85 L50 100 L37 85 L5 100 Z M85 35 A35 35 0 1 1 15 35 A35 35 0 1 1 85 35 Z',.8),
  pathShape('label-bracket','Bracket label','Stars & badges','M15 0 H85 Q85 15 100 15 V85 Q85 85 85 100 H15 Q15 85 0 85 V15 Q15 15 15 0 Z',1.5),
  polygon('burst-irregular','Jagged burst','Stars & badges',pairs([48,0,58,24,77,6,76,34,100,28,84,50,99,66,73,69,78,96,55,82,40,100,34,75,8,83,21,59,0,44,27,38,19,13,42,26])),

  polygon('notched-arrow','Notched arrow','Arrows',pairs([0,20,62,20,62,0,100,50,62,100,62,80,0,80,20,50]),1.7),
  polygon('wide-arrow','Wide arrow','Arrows',pairs([0,27,45,27,45,0,100,50,45,100,45,73,0,73]),1.8),
  polygon('four-way-arrow','Four-way arrow','Arrows',pairs([50,0,72,23,59,23,59,41,77,41,77,28,100,50,77,72,77,59,59,59,59,77,72,77,50,100,28,77,41,77,41,59,23,59,23,72,0,50,23,28,23,41,41,41,41,23,28,23])),
  polygon('vertical-double-arrow','Vertical double arrow','Arrows',pairs([50,0,100,28,68,28,68,72,100,72,50,100,0,72,32,72,32,28,0,28]),.6),
  polygon('corner-double-arrow','Corner double arrow','Arrows',pairs([0,40,40,0,40,25,85,25,85,60,100,60,70,100,40,60,55,60,55,50,40,50,40,75]),1.1),
  pathShape('curved-block-arrow','Curved block arrow','Arrows','M0 100 C0 30 30 13 68 13 V0 L100 30 L68 60 V43 C39 43 30 55 30 100 Z',1.3),
  pathShape('loop-block-arrow','Loop block arrow','Arrows','M27 92 C-12 61 0 0 50 0 C95 0 110 47 90 77 L100 87 L60 100 L66 61 L76 72 C89 49 80 24 51 24 C20 24 13 60 40 74 Z'),
  pathShape('striped-arrow','Striped arrow','Arrows','M0 31 H8 V69 H0 Z M14 31 H27 V69 H14 Z M33 31 H62 V0 L100 50 L62 100 V69 H33 Z',1.9),
  pathShape('chevron-outline','Chevron outline','Arrows','M0 0 H40 L100 50 L40 100 H0 L60 50 Z M16 8 L67 50 L16 92 H37 L88 50 L37 8 Z',1.4),
  polygon('split-arrow','Split arrow','Arrows',pairs([39,100,39,60,17,38,0,55,0,0,55,0,38,17,50,29,62,17,45,0,100,0,100,55,83,38,61,60,61,100])),
  polygon('crossed-arrow','Crossed arrow','Arrows',pairs([0,20,20,0,45,25,45,9,68,32,45,55,45,39,35,29,21,43,55,77,71,61,55,61,78,38,100,61,84,61,84,100,45,100,45,84,29,100,6,77,22,77,0,55,20,35,10,25])),
  pathShape('swoosh-arrow','Swoosh arrow','Arrows','M0 100 C10 39 49 13 79 20 L79 0 L100 32 L74 57 L76 37 C39 41 21 69 0 100 Z',1.4),

  pathShape('oval-callout','Oval callout','Callouts','M50 0 A50 39 0 1 1 18 69 L0 100 L6 56 A50 39 0 0 1 50 0 Z',1.35),
  pathShape('left-callout','Left callout','Callouts','M20 0 H93 Q100 0 100 7 V75 Q100 82 93 82 H20 L0 100 V7 Q0 0 7 0 Z',1.4),
  pathShape('right-callout','Right callout','Callouts','M7 0 H93 Q100 0 100 7 V100 L80 82 H7 Q0 82 0 75 V7 Q0 0 7 0 Z',1.4),
  pathShape('top-callout','Top callout','Callouts','M9 20 H29 L50 0 L55 20 H91 Q100 20 100 29 V91 Q100 100 91 100 H9 Q0 100 0 91 V29 Q0 20 9 20 Z',1.3),
  pathShape('double-tail-callout','Conversation callout','Callouts','M8 12 H28 L17 0 L49 12 H92 Q100 12 100 20 V70 Q100 78 92 78 H73 L87 100 L51 78 H8 Q0 78 0 70 V20 Q0 12 8 12 Z',1.4),
  pathShape('long-tail-callout','Long tail callout','Callouts','M10 0 H90 Q100 0 100 10 V60 Q100 70 90 70 H58 L15 100 L31 70 H10 Q0 70 0 60 V10 Q0 0 10 0 Z',1.6),
  polygon('burst-callout','Comic burst callout','Callouts',pairs([14,0,37,14,52,0,63,17,88,6,87,29,100,43,86,57,100,76,73,75,61,100,48,80,23,94,24,73,0,68,12,48,0,29,21,26]),1.3),
  pathShape('cloud-callout','Cloud callout','Callouts','M18 20 C16 2 36 -5 48 7 C60 -5 82 1 81 18 C102 15 109 41 92 52 C101 70 82 85 66 75 L28 100 L34 76 C14 85 -1 67 9 51 C-7 39 0 20 18 20 Z',1.3),
  pathShape('rounded-caption','Rounded caption','Callouts','M14 0 H86 Q100 0 100 14 V66 Q100 80 86 80 H58 L50 100 L42 80 H14 Q0 80 0 66 V14 Q0 0 14 0 Z',1.4),
  polygon('flag-callout','Flag callout','Callouts',pairs([0,0,100,0,84,40,100,80,15,80,0,100]),1.5),
  pathShape('map-callout','Map pin callout','Callouts','M50 0 C-17 0 -15 68 27 79 L50 100 L73 79 C115 68 117 0 50 0 Z',.9),
  pathShape('square-thought','Square thought bubble','Callouts','M10 0 H90 Q100 0 100 10 V60 Q100 70 90 70 H10 Q0 70 0 60 V10 Q0 0 10 0 Z M31 82 A8 8 0 1 1 15 82 A8 8 0 1 1 31 82 Z M10 97 A3 3 0 1 1 4 97 A3 3 0 1 1 10 97 Z',1.4),

  pathShape('blob-pebble','Pebble','Organic','M18 19 C45 -8 84 -2 96 32 C111 72 81 100 47 100 C9 100 -9 54 18 19 Z',1.2),
  pathShape('blob-kidney','Kidney blob','Organic','M15 12 C53 -10 103 5 98 35 C94 58 59 47 62 75 C66 108 15 108 4 77 C-4 55 0 26 15 12 Z',1.2),
  pathShape('blob-bean','Bean','Organic','M7 69 C-11 28 21 0 48 0 C94 0 112 34 95 67 C82 95 46 69 34 92 C20 117 10 88 7 69 Z',1.4),
  pathShape('blob-triangle','Organic triangle','Organic','M43 3 C57 -8 70 13 82 35 C100 65 112 92 83 97 C56 103 13 105 3 82 C-8 59 27 14 43 3 Z'),
  pathShape('blob-clover','Four-leaf blob','Organic','M50 18 C22 -14 -14 22 18 50 C-14 78 22 114 50 82 C78 114 114 78 82 50 C114 22 78 -14 50 18 Z'),
  pathShape('blob-three-lobes','Three-lobed blob','Organic','M50 0 C82 -2 88 27 77 40 C113 37 111 78 86 90 C69 100 57 92 50 80 C34 111 -6 91 0 66 C3 48 17 44 27 43 C6 20 25 -2 50 0 Z'),
  pathShape('blob-puddle','Puddle','Organic','M3 32 C13 13 34 28 44 10 C56 -12 90 4 88 27 C114 23 112 63 88 68 C102 94 73 111 54 91 C30 110 3 93 12 73 C-8 65 -1 43 3 32 Z',1.4),
  pathShape('blob-wave','Wave blob','Organic','M0 26 C20 0 40 44 62 16 C83 -9 110 14 96 43 C77 75 103 75 88 94 C68 116 54 70 31 88 C2 112 -10 65 7 52 C17 44 -11 43 0 26 Z',1.2),
  pathShape('blob-leaf','Organic leaf','Organic','M0 100 C-3 32 26 -3 100 0 C101 67 68 101 0 100 Z',.8),
  pathShape('blob-comma','Comma blob','Organic','M6 30 C13 -10 85 -10 97 30 C111 78 64 98 30 100 C72 67 56 65 43 69 C14 77 -4 56 6 30 Z'),
  pathShape('blob-splash','Paint splash','Organic','M43 17 C31 -8 13 2 24 28 C0 8 -12 30 15 43 C-11 55 0 76 25 65 C6 90 29 112 43 84 C54 113 76 99 66 78 C96 104 112 78 84 61 C112 49 99 28 78 39 C95 7 69 -5 59 24 C54 12 48 11 43 17 Z'),
  pathShape('blob-scalloped','Scalloped cloud','Organic','M25 13 C29 -4 49 -3 54 11 C68 -4 87 8 83 24 C104 22 111 47 94 57 C110 70 96 94 79 88 C72 109 47 106 42 90 C22 104 4 87 12 69 C-7 64 -3 41 14 36 C3 23 11 10 25 13 Z'),
  pathShape('blob-arc','Curved organic band','Organic','M0 87 C10 23 52 -5 100 6 L94 36 C55 26 32 51 26 100 Z',1.3),
  pathShape('blob-narrow','Tall organic blob','Organic','M37 0 C79 -7 109 39 97 67 C88 91 45 112 18 92 C-10 70 -5 8 37 0 Z',.6),

  polygon('flow-decision','Decision','Flowchart',pairs([50,0,100,50,50,100,0,50]),1.6),
  pathShape('flow-terminator','Terminator','Flowchart','M20 0 H80 A20 50 0 0 1 80 100 H20 A20 50 0 0 1 20 0 Z',2),
  polygon('flow-data','Data input / output','Flowchart',pairs([20,0,100,0,80,100,0,100]),1.8),
  pathShape('flow-document','Document','Flowchart','M0 0 H100 V82 C64 52 39 116 0 85 Z',1.4),
  pathShape('flow-multi-document','Multiple documents','Flowchart','M13 0 H100 V68 H92 V9 H13 Z M6 14 H92 V77 H84 V23 H6 Z M0 28 H84 V85 C55 62 28 113 0 88 Z',1.4),
  pathShape('flow-database','Database cylinder','Flowchart','M0 15 C0 -5 100 -5 100 15 V85 C100 105 0 105 0 85 Z M0 15 C0 35 100 35 100 15 C100 30 0 30 0 15 Z',1.1),
  pathShape('flow-database-outline','Database outline','Flowchart','M0 15 C0 -5 100 -5 100 15 V85 C100 105 0 105 0 85 Z M7 28 V84 C7 97 93 97 93 84 V28 C73 39 27 39 7 28 Z M7 15 C7 28 93 28 93 15 C93 2 7 2 7 15 Z',1.1),
  polygon('flow-preparation','Preparation','Flowchart',pairs([18,0,82,0,100,50,82,100,18,100,0,50]),1.8),
  polygon('flow-manual-input','Manual input','Flowchart',pairs([0,25,100,0,100,100,0,100]),1.6),
  polygon('flow-manual-operation','Manual operation','Flowchart',pairs([0,0,100,0,80,100,20,100]),1.6),
  pathShape('flow-delay','Delay','Flowchart','M0 0 H50 A50 50 0 0 1 50 100 H0 Z',1.4),
  pathShape('flow-stored-data','Stored data','Flowchart','M20 0 H100 C74 20 74 80 100 100 H20 C-7 80 -7 20 20 0 Z',1.6),
  pathShape('flow-display','Display','Flowchart','M18 0 H76 C108 0 108 100 76 100 H18 L0 50 Z',1.7),
  polygon('flow-offpage','Off-page connector','Flowchart',pairs([0,0,100,0,100,63,50,100,0,63]),1.1),
  pathShape('flow-subprocess','Predefined process','Flowchart','M0 0 H100 V100 H0 Z M11 8 V92 H17 V8 Z M83 8 V92 H89 V8 Z',1.7),
  pathShape('flow-tape','Paper tape','Flowchart','M0 15 C36 -15 64 45 100 15 V85 C64 115 36 55 0 85 Z',1.8),
  pathShape('flow-summing','Summing junction','Flowchart','M100 50 A50 50 0 1 1 0 50 A50 50 0 1 1 100 50 Z M43 10 V43 H10 V57 H43 V90 H57 V57 H90 V43 H57 V10 Z'),
  pathShape('flow-annotation','Annotation bracket','Flowchart','M0 0 H22 V7 H7 V93 H22 V100 H0 Z M22 47 H100 V53 H22 Z',1.7),
] as const;

export type ShapeId = typeof SHAPE_LIBRARY[number]['id'];
export const SHAPE_CATEGORIES:readonly ShapeCategory[] = ['Basic','Polygons','Stars & badges','Arrows','Callouts','Lines','Organic','Flowchart'];
const SHAPE_ALIASES:Readonly<Record<string,string>>={rect:'square box',circle:'round disc disk',ellipse:'oval',donut:'doughnut circle hole',plus:'add positive',cross:'multiply cancel times',moon:'crescent lunar',lightning:'bolt electric',arch:'door doorway',semicircle:'half circle','rounded-rect':'rounded square box','right-triangle':'right angle triangle',blob:'organic abstract','flow-decision':'diamond decision','flow-data':'parallelogram input output','flow-terminator':'start end terminal pill','flow-database':'cylinder storage','flow-subprocess':'predefined process','flow-offpage':'connector pentagon'};
export function searchShapes(query='',category:ShapeCategory|'All'='All') {
  const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return SHAPE_LIBRARY.filter(shape=>(category==='All'||shape.category===category)&&terms.every(term=>`${shape.name} ${shape.category} ${shape.id} ${SHAPE_ALIASES[shape.id]||''}`.toLocaleLowerCase().includes(term)));
}
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
