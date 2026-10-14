import type { DesignElement, DesignTemplate } from "./editor-types";

const text = (
  text: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  fill: string,
  extra: Partial<DesignElement> = {},
): DesignElement => ({
  type: "text",
  text,
  x,
  y,
  width,
  fontSize,
  fill,
  fontFamily: "Arial",
  lineHeight: 1.05,
  ...extra,
});
const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  extra: Partial<DesignElement> = {},
): DesignElement => ({ type: "rect", x, y, width, height, fill, ...extra });
const circle = (
  x: number,
  y: number,
  size: number,
  fill: string,
  extra: Partial<DesignElement> = {},
): DesignElement => ({
  type: "circle",
  x,
  y,
  width: size,
  height: size,
  fill,
  ...extra,
});

const STARTER_TEMPLATES: DesignTemplate[] = [
  {
    id: "next-idea",
    name: "Room for an idea",
    category: "Social",
    width: 1080,
    height: 1080,
    background: "#FAF5EC",
    palette: ["#FAF5EC", "#F26B3A", "#292620", "#D38874", "#F6BED0"],
    description: "Warm typography, playful circles, and plenty of space.",
    elements: [
      text("A LITTLE SPACE. A BIG POSSIBILITY.", 78, 62, 820, 20, "#292620", {
        letterSpacing: 120,
        fontWeight: 600,
      }),
      circle(704, 102, 266, "#F6BED0"),
      rect(750, 388, 250, 370, "#D38874", { rx: 125, ry: 125, rotation: 14 }),
      circle(680, 800, 138, "#F26B3A"),
      text("Make room\nfor your\nnext idea.", 74, 244, 865, 145, "#292620", {
        fontFamily: "Georgia",
        lineHeight: 0.98,
        letterSpacing: -25,
      }),
      rect(80, 900, 400, 3, "#292620"),
      text(
        "GOOD THINGS START WITH A BLANK PAGE.",
        80,
        937,
        730,
        21,
        "#292620",
        { letterSpacing: 70 },
      ),
      text("01 / CREATE", 858, 987, 160, 17, "#292620", { align: "right" }),
    ],
  },
  {
    id: "summer-drop",
    name: "Summer, on repeat",
    category: "Social",
    width: 1080,
    height: 1080,
    background: "#F7C84B",
    palette: ["#F7C84B", "#F75B3C", "#342E25", "#FFF9E8"],
    description: "A sunny product announcement with a bold geometric center.",
    elements: [
      text("THE SUNDAY CLUB", 64, 58, 680, 25, "#342E25", {
        fontWeight: 700,
        letterSpacing: 150,
      }),
      text("NEW COLLECTION / 2026", 650, 60, 362, 18, "#342E25", {
        align: "right",
        letterSpacing: 60,
      }),
      circle(268, 256, 540, "#F75B3C"),
      rect(436, 306, 206, 451, "#FFF9E8", { rx: 38, ry: 38, rotation: -9 }),
      text("SUN\nDAY", 438, 421, 218, 64, "#F75B3C", {
        fontWeight: 900,
        align: "center",
        rotation: -9,
      }),
      text("Summer,\non repeat.", 67, 741, 853, 127, "#342E25", {
        fontFamily: "Georgia",
        lineHeight: 0.93,
      }),
      text("Made for the long way home.", 69, 994, 740, 26, "#342E25"),
    ],
  },
  {
    id: "wildflower-story",
    name: "Wildflower journal",
    category: "Story",
    width: 1080,
    height: 1920,
    background: "#ECEDDA",
    palette: ["#ECEDDA", "#354D3F", "#DA7B67", "#FAF8EF"],
    description:
      "A gentle botanical story with a graphic flower and serif headline.",
    elements: [
      text("SLOW DAYS / GOOD THINGS", 81, 90, 918, 26, "#354D3F", {
        letterSpacing: 110,
      }),
      text("Let yourself\ngrow.", 76, 258, 934, 174, "#354D3F", {
        fontFamily: "Georgia",
        lineHeight: 1.02,
      }),
      rect(525, 923, 25, 505, "#354D3F", { rotation: 5 }),
      ...[
        [275, 796],
        [487, 642],
        [696, 810],
        [586, 1030],
        [324, 1019],
      ].map(([x, y]) => circle(x, y, 267, "#DA7B67")),
      circle(455, 899, 164, "#F2C655"),
      rect(245, 1416, 588, 4, "#354D3F"),
      text(
        "Small steps.\nA little sunlight.\nSomething beautiful.",
        135,
        1513,
        810,
        51,
        "#354D3F",
        { align: "center", lineHeight: 1.35 },
      ),
      text("THE WILDFLOWER JOURNAL", 173, 1820, 734, 22, "#354D3F", {
        align: "center",
        letterSpacing: 180,
      }),
    ],
  },
  {
    id: "studio-cover",
    name: "A fresh perspective",
    category: "Presentation",
    width: 1920,
    height: 1080,
    background: "#F1F0EA",
    palette: ["#F1F0EA", "#233C34", "#BBCDB7", "#D8A38B"],
    description: "An understated opening slide for a thoughtful presentation.",
    elements: [
      text("FIELDWORK STUDIO", 90, 76, 1140, 29, "#233C34", {
        fontWeight: 700,
        letterSpacing: 180,
      }),
      text("STRATEGY / DESIGN / IDEAS", 1240, 80, 590, 22, "#233C34", {
        align: "right",
        letterSpacing: 90,
      }),
      circle(1310, 335, 630, "#BBCDB7"),
      rect(1480, 340, 229, 660, "#D8A38B", { rotation: 27 }),
      text("A fresh\nperspective.", 86, 292, 1380, 182, "#233C34", {
        fontFamily: "Georgia",
        lineHeight: 1.02,
      }),
      rect(92, 820, 750, 3, "#233C34"),
      text(
        "Good questions lead to better possibilities.",
        94,
        861,
        1030,
        33,
        "#233C34",
      ),
      text("OCTOBER 2026", 96, 987, 530, 23, "#233C34", { letterSpacing: 110 }),
      text("01", 1730, 985, 95, 29, "#233C34", { align: "right" }),
    ],
  },
  {
    id: "night-market",
    name: "After hours market",
    category: "Poster",
    width: 1080,
    height: 1528,
    background: "#22283A",
    palette: ["#22283A", "#DFE58D", "#F07767", "#EEEAE0"],
    description: "A lively event poster with layered type and a graphic moon.",
    elements: [
      text("A NEIGHBORHOOD GET-TOGETHER", 74, 76, 928, 23, "#EEEAE0", {
        letterSpacing: 100,
      }),
      circle(566, 193, 393, "#DFE58D"),
      circle(648, 152, 393, "#22283A"),
      text("AFTER\nHOURS", 63, 294, 944, 190, "#EEEAE0", {
        fontWeight: 900,
        letterSpacing: -40,
        lineHeight: 0.91,
      }),
      text("MARKET", 66, 700, 943, 141, "#F07767", {
        fontWeight: 900,
        letterSpacing: -40,
      }),
      rect(75, 921, 928, 3, "#EEEAE0"),
      text(
        "FOOD. MUSIC. MAKERS.\nA LITTLE SOMETHING FOR EVERYONE.",
        79,
        976,
        908,
        30,
        "#EEEAE0",
        { lineHeight: 1.6 },
      ),
      text("SATURDAY\n24 OCTOBER", 77, 1167, 482, 46, "#DFE58D", {
        fontWeight: 700,
        lineHeight: 1.2,
      }),
      text("6 PM — LATE\nTHE OLD COURTYARD", 589, 1174, 408, 29, "#EEEAE0", {
        align: "right",
        lineHeight: 1.5,
      }),
      text("COME AS YOU ARE.", 77, 1435, 916, 24, "#EEEAE0", {
        letterSpacing: 120,
      }),
    ],
  },
  {
    id: "olive-note",
    name: "A note of thanks",
    category: "Card",
    width: 1480,
    height: 1050,
    background: "#FBF8F0",
    palette: ["#FBF8F0", "#455643", "#C3CBAC", "#D69A7C"],
    description:
      "A quiet thank-you card with a simple olive-inspired illustration.",
    elements: [
      rect(53, 53, 1374, 944, "transparent", {
        stroke: "#C3CBAC",
        strokeWidth: 3,
      }),
      rect(1195, 286, 10, 538, "#455643", { rotation: 16 }),
      ...[
        [1086, 304, -30],
        [1230, 406, 35],
        [1044, 517, -30],
        [1177, 670, 35],
      ].map(([x, y, rotation]) =>
        rect(x, y, 126, 58, "#C3CBAC", { rx: 60, ry: 60, rotation }),
      ),
      text("A LITTLE NOTE TO SAY", 116, 192, 1020, 25, "#455643", {
        letterSpacing: 180,
      }),
      text("Thank you.", 107, 338, 1252, 160, "#455643", {
        fontFamily: "Georgia",
      }),
      text(
        "For your kindness, your time,\nand all the little things.",
        121,
        569,
        986,
        43,
        "#455643",
        { lineHeight: 1.35 },
      ),
      text("WITH GRATITUDE,", 123, 825, 716, 24, "#455643", {
        letterSpacing: 140,
      }),
      text("Your name", 119, 875, 774, 42, "#D69A7C", {
        fontFamily: "Georgia",
        fontStyle: "italic",
      }),
    ],
  },
  {
    id: "brand-orbit",
    name: "Orbit brand mark",
    category: "Logo",
    width: 1080,
    height: 1080,
    background: "#EBEFF6",
    palette: ["#EBEFF6", "#334A88", "#ED764E"],
    description: "A clean geometric identity starter, ready for your own name.",
    elements: [
      circle(375, 225, 330, "transparent", {
        stroke: "#334A88",
        strokeWidth: 24,
      }),
      circle(475, 325, 130, "#334A88"),
      circle(628, 204, 85, "#ED764E"),
      text("orbit", 161, 651, 758, 170, "#334A88", {
        fontFamily: "Georgia",
        align: "center",
        letterSpacing: -50,
      }),
      text("IDEAS IN MOTION", 213, 860, 654, 23, "#334A88", {
        letterSpacing: 250,
        align: "center",
      }),
    ],
  },
  {
    id: "small-habits",
    name: "Small habits, big shift",
    category: "Infographic",
    width: 1080,
    height: 1350,
    background: "#FFF9ED",
    palette: ["#FFF9ED", "#2E4740", "#ECC374", "#DC927C", "#C3D3B7"],
    description: "Three simple steps in a clear, friendly vertical layout.",
    elements: [
      text("A GUIDE TO THE EVERYDAY", 67, 62, 932, 21, "#2E4740", {
        letterSpacing: 140,
      }),
      text("Small habits.\nBig shift.", 62, 168, 961, 113, "#2E4740", {
        fontFamily: "Georgia",
        lineHeight: 0.98,
      }),
      ...[
        {
          y: 506,
          color: "#ECC374",
          number: "01",
          title: "Start small.",
          body: "One thing you can do today.\nMake it easy to begin.",
        },
        {
          y: 748,
          color: "#DC927C",
          number: "02",
          title: "Stay curious.",
          body: "Ask a better question.\nTry a different way.",
        },
        {
          y: 990,
          color: "#C3D3B7",
          number: "03",
          title: "Keep going.",
          body: "A little progress every day\nadds up to something good.",
        },
      ].flatMap(({ y, color, number, title, body }) => [
        circle(73, y, 161, color),
        text(number, 82, y + 46, 142, 49, "#2E4740", {
          align: "center",
          fontWeight: 700,
        }),
        text(title, 284, y + 6, 714, 48, "#2E4740", { fontFamily: "Georgia" }),
        text(body, 285, y + 90, 706, 29, "#2E4740", { lineHeight: 1.3 }),
      ]),
      text("MAKE SPACE FOR WHAT MATTERS.", 76, 1273, 924, 20, "#2E4740", {
        letterSpacing: 110,
      }),
    ],
  },
  {
    id: "coffee-menu",
    name: "Good morning coffee",
    category: "Menu",
    width: 1080,
    height: 1528,
    background: "#E9D8C5",
    palette: ["#E9D8C5", "#493529", "#AE6650", "#F9F2E8"],
    description: "An inviting café menu with editable items and prices.",
    elements: [
      text("THE CORNER CAFÉ", 84, 71, 912, 24, "#493529", {
        letterSpacing: 180,
        align: "center",
      }),
      text("Good\nmorning.", 76, 187, 930, 154, "#493529", {
        fontFamily: "Georgia",
        align: "center",
        lineHeight: 0.98,
      }),
      circle(450, 567, 180, "#AE6650"),
      rect(490, 607, 100, 91, "#F9F2E8", { rx: 12, ry: 12 }),
      circle(577, 623, 45, "transparent", {
        stroke: "#F9F2E8",
        strokeWidth: 12,
      }),
      text("COFFEE & CONVERSATION", 82, 807, 916, 25, "#493529", {
        letterSpacing: 140,
        align: "center",
      }),
      rect(111, 887, 858, 2, "#493529"),
      ...[
        ["Espresso", "₹120"],
        ["Americano", "₹160"],
        ["Cappuccino", "₹200"],
        ["Oat latte", "₹240"],
      ].flatMap(([item, price], i) => [
        text(item, 115, 939 + i * 88, 664, 40, "#493529", {
          fontFamily: "Georgia",
        }),
        text(price, 776, 942 + i * 88, 190, 34, "#493529", { align: "right" }),
      ]),
      text("EVERY DAY / 8 AM TO 6 PM", 110, 1401, 860, 23, "#493529", {
        letterSpacing: 140,
        align: "center",
      }),
    ],
  },
  {
    id: "new-chapter",
    name: "A new chapter",
    category: "Invitation",
    width: 1080,
    height: 1350,
    background: "#F6E8E6",
    palette: ["#F6E8E6", "#654542", "#B98981", "#EFE1C9"],
    description:
      "A romantic invitation with soft arches and carefully spaced type.",
    elements: [
      rect(140, 106, 800, 1150, "#EFE1C9", { rx: 400, ry: 400 }),
      text("TOGETHER WITH THEIR FAMILIES", 184, 319, 712, 21, "#654542", {
        align: "center",
        letterSpacing: 140,
      }),
      text("Alex\n& Jamie", 154, 454, 772, 119, "#654542", {
        fontFamily: "Georgia",
        align: "center",
        lineHeight: 1.02,
      }),
      text(
        "INVITE YOU TO CELEBRATE\nTHEIR NEXT CHAPTER",
        179,
        764,
        722,
        22,
        "#654542",
        { align: "center", lineHeight: 1.6, letterSpacing: 90 },
      ),
      rect(420, 928, 240, 2, "#B98981"),
      text(
        "SATURDAY, 14 NOVEMBER\nAT FOUR IN THE AFTERNOON",
        201,
        974,
        679,
        25,
        "#654542",
        { align: "center", lineHeight: 1.7 },
      ),
      text("The Garden House", 201, 1117, 679, 38, "#654542", {
        align: "center",
        fontFamily: "Georgia",
        fontStyle: "italic",
      }),
    ],
  },
];


// Original, offline-ready layouts: every word and graphic remains an editor object.
const original = (id: string, name: string, category: string, width: number, height: number, background: string, palette: string[], elements: DesignElement[], description: string): DesignTemplate => ({id,name,category,width,height,background,palette,elements,description});
const labelText = (value: string,x: number,y: number,w: number,color: string,size=20,extra: Partial<DesignElement>={}) => text(value,x,y,w,size,color,{fontWeight:700,letterSpacing:100,...extra});
const serif = (value: string,x: number,y: number,w: number,size: number,color: string,extra: Partial<DesignElement>={}) => text(value,x,y,w,size,color,{fontFamily:'Georgia',lineHeight:1.08,...extra});
const rule = (x: number,y: number,w: number,color: string) => rect(x,y,w,2,color);
const ORIGINAL_TEMPLATES: DesignTemplate[] = [
 original('morning-ritual','A slower morning','Social',1080,1080,'#f5ead8',['#f5ead8','#422d25','#ba755d','#d2b99b'],[
  labelText('THE DAILY RITUAL',70,58,920,'#422d25'),circle(641,160,341,'#d2b99b'),rect(722,240,161,197,'#f5ead8',{rx:25,ry:25}),circle(850,260,85,'transparent',{stroke:'#f5ead8',strokeWidth:21}),rect(745,180,8,35,'#422d25',{rotation:-10}),rect(780,153,8,54,'#422d25',{rotation:9}),serif('Take a\nslower\nmorning.',64,228,650,121,'#422d25'),rule(70,803,940,'#422d25'),text('One cup. One quiet moment.\nA little room to breathe.',72,853,800,31,'#422d25',{lineHeight:1.5}),labelText('COFFEE / CONVERSATION / CARE',70,1006,930,'#422d25',16)
 ],'A warm café post with a drawn cup and generous editorial type.'),
 original('creative-workshop','Make something together','Social',1080,1080,'#ece7fd',['#ece7fd','#412e78','#ff876c','#dbc94b'],[
  rect(650,93,335,430,'#ff876c',{rx:160,ry:160}),circle(727,172,183,'#dbc94b'),rect(699,396,265,37,'#412e78',{rotation:-20}),labelText('SATURDAY STUDIO',66,58,700,'#412e78'),serif('Make\nsomething\ntogether.',61,194,754,117,'#412e78'),text('An afternoon of ideas, color,\nand the joy of making.',70,653,880,34,'#412e78',{lineHeight:1.35}),rect(69,823,943,127,'#412e78',{rx:15,ry:15}),labelText('CREATIVE WORKSHOP',100,850,750,'#ece7fd',23),text('14 NOVEMBER  ·  2–5 PM  ·  STUDIO 04',100,899,795,20,'#ece7fd'),labelText('ALL SKILL LEVELS WELCOME',70,1007,930,'#412e78',16)
 ],'An expressive workshop announcement with useful event details.'),
 original('book-club-note','Between the pages','Social',1080,1080,'#162f35',['#162f35','#f6e7ca','#d6b377'],[
  labelText('THE AFTERNOON BOOK CLUB',72,61,936,'#f6e7ca'),serif('“',71,145,500,210,'#d6b377'),serif('There is always\nanother story\nwaiting for you.',89,351,900,82,'#f6e7ca'),rule(91,717,895,'#d6b377'),text('This month: a book that changes\nthe way we see the everyday.',91,761,865,31,'#f6e7ca',{lineHeight:1.35}),circle(901,942,45,'#d6b377'),labelText('READ / MEET / REPEAT',91,962,790,'#f6e7ca',18),rect(70,128,940,5,'#d6b377')
 ],'A literary quote composition with clear reading-club context.'),
 original('olive-object','Objects for everyday','Social',1080,1080,'#e9eddd',['#e9eddd','#34483c','#c6ceaa','#c77653'],[
  labelText('FORM & FIELD',70,58,860,'#34483c'),circle(728,120,274,'#c6ceaa'),rect(760,218,208,110,'#c77653',{rx:55,ry:55}),rect(774,235,184,28,'#34483c',{rx:14,ry:14}),rect(812,319,104,55,'#c77653'),serif('Objects\nfor everyday.',66,263,700,103,'#34483c'),text('Thoughtful forms.\nMade to be used, made to last.',72,637,834,33,'#34483c',{lineHeight:1.35}),rule(72,824,930,'#34483c'),labelText('THE AUTUMN COLLECTION',72,873,920,'#34483c',25),text('Explore the collection at formandfield.example',72,932,920,22,'#34483c'),labelText('CERAMICS / SMALL BATCH / SLOW MADE',72,1011,920,'#34483c',15)
 ],'An original sculptural product post using only editable vector shapes.'),
 original('open-studio-day','The door is open','Social',1080,1080,'#fce9e6',['#fce9e6','#902f46','#ee997f','#faefc2'],[
  rect(688,119,292,447,'#ee997f',{rx:145,ry:145}),rect(741,193,181,373,'#faefc2',{rx:90,ry:90}),circle(875,396,12,'#902f46'),labelText('OPEN STUDIO / ONE DAY ONLY',64,60,950,'#902f46'),serif('The door\nis open.',59,202,907,155,'#902f46'),text('Meet the makers. Find your favorites.\nTake a little inspiration home.',67,626,926,31,'#902f46',{lineHeight:1.4}),rule(68,822,943,'#902f46'),labelText('SUNDAY 22 NOVEMBER',68,863,945,'#902f46',28),text('11 AM–4 PM  ·  18 GARDEN LANE',68,922,940,24,'#902f46'),labelText('EVERYONE IS WELCOME',68,1006,940,'#902f46',17)
 ],'A welcoming open-studio invitation with an architectural arch.'),
 original('weekly-reset','The weekly reset','Social',1080,1080,'#f8f5ed',['#f8f5ed','#263b4f','#82b4af','#e0b57c'],[
  labelText('A LITTLE STRUCTURE, A LITTLE SPACE',68,61,950,'#263b4f',18),serif('The weekly\nreset.',64,174,934,132,'#263b4f'),...['Plan one thing.','Make time to move.','Leave room for good things.'].flatMap((v,i)=>[rect(74,536+i*121,44,44,'transparent',{stroke:'#82b4af',strokeWidth:3,rx:8,ry:8}),text(v,150,536+i*121,824,37,'#263b4f')]),circle(876,865,104,'#e0b57c'),rule(73,942,760,'#263b4f'),labelText('START SMALL. COME BACK OFTEN.',73,988,900,'#263b4f',17)
 ],'A usable three-step reset checklist with editable checkbox shapes.'),
 original('product-release','Ideas, in one place','Social',1080,1080,'#181d30',['#181d30','#f6f5ff','#ae97ff','#76d1cc'],[
  labelText('MEET NOTEHOUSE',70,57,850,'#ae97ff'),serif('Ideas,\nin one place.',66,170,920,128,'#f6f5ff'),rect(72,562,936,353,'#f6f5ff',{rx:24,ry:24}),rect(91,582,254,312,'#e7e2fa',{rx:14,ry:14}),labelText('YOUR SPACE',115,610,230,'#443773',17),rect(118,662,179,15,'#ae97ff',{rx:7,ry:7}),rect(118,702,138,15,'#c4b7ee',{rx:7,ry:7}),rect(375,621,595,115,'#76d1cc',{rx:15,ry:15}),text('A home for your next idea.',403,654,530,33,'#181d30',{fontWeight:700}),rect(375,757,278,107,'#e7e2fa',{rx:15,ry:15}),rect(673,757,297,107,'#efe7d2',{rx:15,ry:15}),text('Make space for what matters. Try it today.',70,973,947,27,'#f6f5ff')
 ],'A software launch post with a complete editable dashboard illustration.'),
 original('year-in-small-moments','A year in small moments','Story',1080,1920,'#efe6d6',['#efe6d6','#634936','#d6a386','#b9bfa5'],[
  labelText('THE THINGS WE WILL REMEMBER',70,77,940,'#634936',21),serif('A year in\nsmall\nmoments.',63,237,946,155,'#634936'),rect(74,798,442,384,'#d6a386',{rx:25,ry:25}),circle(174,886,228,'#efe6d6'),rect(553,798,451,384,'#b9bfa5',{rx:25,ry:25}),rect(648,865,256,249,'transparent',{stroke:'#efe6d6',strokeWidth:14,rx:100,ry:100}),text('01 / NEW PLACES',85,1219,426,23,'#634936',{fontWeight:700}),text('02 / GOOD COMPANY',558,1219,433,23,'#634936',{fontWeight:700}),rule(75,1350,929,'#634936'),text('The long conversations.\nThe places we found by accident.\nThe days that felt like home.',77,1410,927,47,'#634936',{lineHeight:1.45}),labelText('HERE IS TO MORE OF THE EVERYDAY.',77,1815,926,'#634936',18)
 ],'An editorial story with two abstract memory frames and a reflective caption.'),
 original('future-by-design','The future, by design','Presentation',1920,1080,'#112f36',['#112f36','#f7edda','#d9bb7b','#4f7777'],[
  labelText('NORTHLINE / STRATEGY & DESIGN',95,67,1430,'#f7edda',24),circle(1350,130,418,'transparent',{stroke:'#4f7777',strokeWidth:38}),circle(1445,225,229,'#d9bb7b'),serif('The future,\nby design.',89,257,1440,173,'#f7edda'),text('A practical vision for what comes next.',96,730,1420,41,'#f7edda'),rule(95,921,1732,'#4f7777'),labelText('ANNUAL OUTLOOK / 2027',95,966,1230,'#f7edda',23),text('01',1690,960,134,29,'#d9bb7b',{align:'right'})
 ],'A confident title slide with an orbit graphic and a clear subtitle.'),
 original('conversation-agenda','Today’s conversation','Presentation',1920,1080,'#faf6ef',['#faf6ef','#342d4b','#ae97dc','#e2d8f1'],[
  labelText('WORKSHOP / 45 MINUTES',91,62,1520,'#342d4b',23),serif('Today’s\nconversation.',86,193,835,110,'#342d4b'),rect(995,203,3,630,'#ae97dc'),...['Where we are','What we learned','Where we go next','Questions & ideas'].flatMap((s,i)=>[circle(970,216+i*165,54,'#ae97dc'),labelText(String(i+1).padStart(2,'0'),981,232+i*165,35,'#faf6ef',15),text(s,1090,226+i*165,733,44,'#342d4b'),text(['10 MIN','15 MIN','15 MIN','5 MIN'][i],1092,284+i*165,700,20,'#76688c')]),rule(92,944,1730,'#ae97dc'),labelText('GOOD QUESTIONS LEAD TO BETTER DECISIONS.',92,982,1650,'#342d4b',20)
 ],'A four-part agenda with editable timings and a vertical timeline.'),
 original('quarterly-snapshot','A quarter in focus','Presentation',1920,1080,'#f3f5f0',['#f3f5f0','#253f36','#b9cbaa','#e9c883'],[
  labelText('BUSINESS REVIEW / Q3',92,63,1570,'#253f36',23),serif('A quarter in focus.',88,165,1732,120,'#253f36'),text('Momentum across the measures that matter.',93,324,1700,33,'#4e665a'),...['24%','8,400','92%'].flatMap((v,i)=>[rect(93+i*584,444,553,385,i===1?'#253f36':'#b9cbaa',{rx:18,ry:18}),text(v,125+i*584,502,488,111,i===1?'#f3f5f0':'#253f36',{fontWeight:700}),labelText(['REVENUE GROWTH','ACTIVE CUSTOMERS','SATISFACTION'][i],127+i*584,677,480,i===1?'#f3f5f0':'#253f36',22),text(['Versus the prior quarter','Across our core products','From customer feedback'][i],127+i*584,733,470,23,i===1?'#cfdcd4':'#4e665a')]),rule(94,930,1729,'#b9cbaa'),text('Illustrative figures. Replace with your verified results.',94,972,1550,23,'#4e665a'),text('03',1700,965,120,26,'#253f36',{align:'right'})
 ],'An executive summary slide with three distinct, editable metric cards.'),
 original('people-behind-work','The people behind the work','Presentation',1920,1080,'#f4ebe4',['#f4ebe4','#423343','#b99eaf','#cca98b'],[
  labelText('OUR TEAM',95,67,1715,'#423343',23),serif('The people behind the work.',89,169,1750,100,'#423343'),...['Avery Morgan','Taylor Kim','Jordan Patel'].flatMap((v,i)=>[rect(96+i*584,353,546,358,['#b99eaf','#cca98b','#bdc5af'][i],{rx:16,ry:16}),circle(259+i*584,398,202,'#f4ebe4'),rect(214+i*584,586,289,126,'#f4ebe4',{rx:130,ry:130}),text(v,96+i*584,758,546,43,'#423343',{fontWeight:700}),text(['Strategy lead','Creative director','Product designer'][i],96+i*584,824,546,28,'#695767')]),rule(96,944,1720,'#b99eaf'),text('Different perspectives. One shared ambition.',96,981,1680,27,'#423343')
 ],'A team introduction with original geometric portraits and editable biographies.'),
 original('roadmap-next-four','From idea to impact','Presentation',1920,1080,'#fff9ee',['#fff9ee','#2e4054','#aabdd1','#d8c6a4'],[
  labelText('THE ROADMAP',94,64,1600,'#2e4054',23),serif('From idea to impact.',89,167,1740,117,'#2e4054'),text('A sequence we can act on, together.',95,324,1710,34,'#2e4054'),...['Discover','Define','Build','Learn'].flatMap((v,i)=>[rect(95+i*443,440,415,415,['#dfe8ed','#d8c6a4','#bdcdbb','#d6c5db'][i],{rx:14,ry:14}),labelText('0'+(i+1),128+i*443,473,346,'#2e4054',25),text(v,128+i*443,555,346,48,'#2e4054',{fontWeight:700}),text(['Listen to people.\nMap the opportunity.','Choose the focus.\nAgree on success.','Make it tangible.\nTest and improve.','Measure what changed.\nShare what works.'][i],128+i*443,651,346,28,'#2e4054',{lineHeight:1.4}),rule(128+i*443,783,320,'#2e4054')]),text('Each phase has a clear owner and a measurable outcome.',95,962,1710,26,'#2e4054')
 ],'A four-phase roadmap with tangible actions rather than empty placeholder boxes.'),
 original('case-study-change','A clearer path forward','Presentation',1920,1080,'#f6f1f8',['#f6f1f8','#453350','#ac8ac0','#d2c0de'],[
  labelText('CASE STUDY / THE CUSTOMER JOURNEY',94,66,1680,'#453350',23),serif('A clearer path forward.',90,171,1740,113,'#453350'),rect(95,395,840,444,'#e3d8ea',{rx:15,ry:15}),rect(965,395,855,444,'#453350',{rx:15,ry:15}),labelText('BEFORE',128,438,757,'#453350',24),labelText('AFTER',1005,438,763,'#f6f1f8',24),text('Too many steps.\nUnclear choices.\nA fragmented experience.',128,538,745,43,'#453350',{lineHeight:1.5}),text('One clear starting point.\nHelpful guidance.\nA consistent experience.',1005,538,760,43,'#f6f1f8',{lineHeight:1.5}),rule(95,939,1725,'#ac8ac0'),text('What changed: fewer barriers, better decisions, more confidence.',95,976,1710,30,'#453350')
 ],'A before/after case-study slide with meaningful editable comparison text.'),
 original('thanks-conversation','Let’s keep the conversation going','Presentation',1920,1080,'#e3ece9',['#e3ece9','#223f3b','#8baea4','#ecc19b'],[
  labelText('THANK YOU',95,67,1560,'#223f3b',24),circle(1451,94,325,'#8baea4'),circle(1546,189,136,'#ecc19b'),serif('Let’s keep the\nconversation going.',88,295,1730,131,'#223f3b'),rule(96,814,1730,'#223f3b'),text('hello@yourstudio.example',96,866,1430,39,'#223f3b'),text('yourstudio.example',96,936,1430,29,'#223f3b'),labelText('IDEAS ARE BETTER TOGETHER.',95,1016,1600,'#223f3b',18)
 ],'A closing slide with room for real contact details and a shared next step.'),
 original('clay-and-company','Clay & company','Poster',1080,1528,'#e9d9c5',['#e9d9c5','#5c3b2d','#bc795b','#f5eadc'],[
  labelText('A WEEKEND WITH THE MAKERS',76,77,928,'#5c3b2d',22),serif('Clay &\ncompany.',68,210,956,144,'#5c3b2d'),rect(361,693,349,333,'#bc795b',{rx:148,ry:148}),rect(443,603,184,182,'#bc795b',{rx:33,ry:33}),rect(464,622,142,40,'#5c3b2d',{rx:20,ry:20}),circle(231,900,194,'#f5eadc'),rule(77,1113,926,'#5c3b2d'),labelText('CERAMICS / CRAFT / CONVERSATION',77,1169,925,'#5c3b2d',25),text('21–22 NOVEMBER  ·  10 AM–5 PM\nTHE OLD WORKSHOP, 12 RIVER STREET',77,1266,925,29,'#5c3b2d',{lineHeight:1.7}),labelText('MEET THE PEOPLE BEHIND THE PIECES.',77,1452,926,'#5c3b2d',17)
 ],'A tactile craft-market poster with a vector vase and full event information.'),
 original('jazz-after-dark','Jazz, after dark','Poster',1080,1528,'#182439',['#182439','#fff1d0','#efaa53','#b88ba0'],[
  labelText('THE BLUE ROOM PRESENTS',75,75,930,'#fff1d0',23),serif('Jazz,\nafter dark.',69,193,950,151,'#fff1d0'),...Array.from({length:9},(_,i)=>rect(77+i*103,742,94,291,'#fff1d0',{rx:4,ry:4})),...[0,1,3,4,5,7].map(i=>rect(139+i*103,742,48,172,'#182439')),circle(783,539,192,'#efaa53'),labelText('LIVE QUARTET / EVERY FRIDAY',77,1147,925,'#efaa53',27),text('Doors 7 PM  ·  Music 8 PM\nReserve a table. Stay for one more song.',77,1240,925,32,'#fff1d0',{lineHeight:1.5}),rule(77,1405,925,'#b88ba0'),labelText('18 MARKET SQUARE / THEBLUEROOM.EXAMPLE',77,1457,925,'#fff1d0',16)
 ],'A music-night poster with a complete piano-key illustration.'),
 original('walk-a-little-further','Walk a little further','Poster',1080,1528,'#e2eddf',['#e2eddf','#2d493e','#81a589','#ebc57b'],[
  labelText('SUNDAY WALK CLUB',76,76,931,'#2d493e',23),serif('Walk a\nlittle\nfurther.',69,219,940,156,'#2d493e'),...Array.from({length:5},(_,i)=>circle(459-i*30,719-i*30,410+i*60,'transparent',{stroke:'#81a589',strokeWidth:7})),circle(535,796,253,'#ebc57b'),rect(83,1072,917,211,'#2d493e',{rx:16,ry:16}),labelText('GOOD COMPANY. FRESH AIR.',110,1111,859,'#e2eddf',27),text('SUNDAY  ·  8 AM  ·  MEET AT THE PARK GATE\nAn easy 5 km loop. Everyone is welcome.',111,1170,858,24,'#e2eddf',{lineHeight:1.6}),labelText('BRING WATER. LEAVE THE RUSH BEHIND.',77,1438,928,'#2d493e',17)
 ],'A community walking poster with contour-like circles and practical details.'),
 original('learn-build-repeat','Learn. Build. Repeat.','Flyer',1080,1528,'#eee7fb',['#eee7fb','#433267','#b098de','#efbd71'],[
  labelText('THE NEXT CHAPTER WORKSHOP',74,76,934,'#433267',21),rect(732,173,243,345,'#b098de',{rx:120,ry:120}),circle(787,228,128,'#efbd71'),serif('Learn.\nBuild.\nRepeat.',64,233,939,161,'#433267'),text('An honest introduction to turning\na good idea into a useful business.',75,814,924,38,'#433267',{lineHeight:1.4}),rule(76,984,926,'#433267'),labelText('SATURDAY 28 NOVEMBER',76,1041,927,'#433267',28),text('10 AM–1 PM  ·  THE COMMUNITY STUDIO\nBring a notebook and an open mind.',77,1120,925,27,'#433267',{lineHeight:1.6}),rect(76,1291,927,91,'#433267',{rx:13,ry:13}),labelText('SAVE YOUR PLACE / WORKSHOP.EXAMPLE',98,1324,883,'#eee7fb',21),labelText('SMALL GROUP. BIG POSSIBILITIES.',76,1445,926,'#433267',16)
 ],'A usable workshop flyer with a strong title and registration call to action.'),
 original('bakery-first-light','Baked at first light','Flyer',1080,1528,'#fff0da',['#fff0da','#7b442c','#ddb16f','#bc6a47'],[
  labelText('THE LITTLE BAKERY',76,73,928,'#7b442c',23),serif('Baked at\nfirst light.',67,199,948,147,'#7b442c'),circle(221,651,464,'#ddb16f'),circle(284,714,338,'#fff0da'),rect(509,703,259,299,'#bc6a47',{rx:90,ry:90,rotation:16}),...Array.from({length:4},(_,i)=>rect(536+i*39,739+i*12,8,95,'#fff0da',{rotation:16})),rule(76,1131,928,'#7b442c'),text('Fresh bread. Warm pastries.\nThe kind of morning worth getting up for.',77,1190,926,34,'#7b442c',{lineHeight:1.4}),labelText('OPEN DAILY / 7 AM–3 PM',76,1353,927,'#7b442c',25),text('24 Orchard Lane  ·  Take a little joy home.',76,1434,927,24,'#7b442c')
 ],'A bakery launch flyer with original editable bread and pastry graphics.'),
 original('stories-in-the-square','Stories in the square','Flyer',1080,1528,'#f3e3db',['#f3e3db','#452c42','#bf7670','#dfb578'],[
  labelText('THE NEIGHBORHOOD LITERARY FESTIVAL',73,72,934,'#452c42',20),serif('Stories in\nthe square.',65,216,950,137,'#452c42'),rect(165,629,195,392,'#bf7670',{rotation:-9}),rect(418,663,179,373,'#452c42'),rect(650,632,231,399,'#dfb578',{rotation:8}),labelText('IDEAS',181,794,161,'#f3e3db',22,{rotation:-9}),labelText('WORDS',428,819,157,'#f3e3db',22),labelText('STORIES',656,817,208,'#452c42',22,{rotation:8}),rule(75,1121,929,'#452c42'),text('Readings. Conversations. Independent books.\nA full day of seeing things differently.',75,1174,928,29,'#452c42',{lineHeight:1.5}),labelText('SATURDAY 5 DECEMBER / 10 AM–6 PM',75,1346,928,'#452c42',23),text('THE TOWN SQUARE  ·  FREE ENTRY',75,1441,928,22,'#452c42')
 ],'A literary festival flyer with an original illustrated stack of books.'),
 original('garden-lunch-menu','A table in the garden','Menu',1080,1528,'#f3f0e5',['#f3f0e5','#344f40','#aaba97','#cc976e'],[
  labelText('THE GARDEN TABLE',74,62,934,'#344f40',22,{align:'center'}),serif('Lunch,\nunhurried.',71,152,939,116,'#344f40',{align:'center'}),rule(77,454,927,'#aaba97'),labelText('FROM THE KITCHEN',79,511,925,'#344f40',26),...['Roasted tomato soup|₹280|Basil oil, warm sourdough','Garden grain bowl|₹420|Seasonal greens, lemon dressing','Wild mushroom toast|₹390|Herbs, cultured butter','House vegetable tart|₹460|A crisp salad on the side'].flatMap((row,i)=>{const [item,price,body]=row.split('|');return [serif(item,82,599+i*151,706,34,'#344f40'),text(price,835,603+i*151,163,29,'#344f40',{align:'right'}),text(body,84,653+i*151,850,22,'#64735e')]}),rule(80,1250,920,'#aaba97'),serif('Something sweet?',83,1300,918,40,'#344f40'),text('Lemon loaf & tea / ₹240',84,1367,918,28,'#344f40'),labelText('SEASONAL FOOD. GOOD COMPANY.',83,1457,918,'#344f40',17)
 ],'A complete lunch menu with editable dish descriptions and aligned prices.'),
 original('evening-drinks-menu','The evening list','Menu',1080,1528,'#242c41',['#242c41','#fff0d6','#d8a369','#bd8290'],[
  labelText('THE PARLOR / DRINKS & CONVERSATION',78,75,925,'#fff0d6',19,{align:'center'}),serif('The\nevening list.',72,186,938,139,'#fff0d6',{align:'center'}),rule(83,569,913,'#d8a369'),...['Citrus & sage|₹480|Bright citrus, garden herbs, soda','Orchard spritz|₹520|Apple, elderflower, sparkling wine','The midnight|₹560|Dark berry, ginger, a little warmth','Rose lemonade|₹300|House-made, alcohol-free'].flatMap((row,i)=>{const[a,b,c]=row.split('|');return[circle(88,642+i*166,27,i%2?'#bd8290':'#d8a369'),serif(a,142,635+i*166,645,39,'#fff0d6'),text(b,842,641+i*166,151,30,'#d8a369',{align:'right'}),text(c,144,697+i*166,820,23,'#c7bfc0')]}),rule(83,1322,913,'#d8a369'),labelText('SLOW EVENINGS / GOOD COMPANY',83,1386,913,'#fff0d6',22,{align:'center'}),text('Please enjoy responsibly.',84,1461,912,19,'#c7bfc0',{align:'center'})
 ],'An atmospheric drinks menu with full descriptions and alcohol-free options.'),
 original('architect-business-card','Structure & space','Business card',1050,600,'#f5f1e8',['#f5f1e8','#263f42','#9bafa9'],[
  rect(64,65,147,147,'transparent',{stroke:'#263f42',strokeWidth:5}),rect(108,112,105,105,'#9bafa9'),rule(297,77,689,'#9bafa9'),serif('Rowan Wells',297,123,693,56,'#263f42'),labelText('ARCHITECT / SPATIAL DESIGNER',301,208,680,'#263f42',15),text('Spaces for how we live.',301,283,680,23,'#263f42'),rule(301,360,685,'#9bafa9'),text('hello@rowanwells.example\n+91 90000 00000\nrowanwells.example',302,404,680,22,'#263f42',{lineHeight:1.55}),labelText('RW',63,506,159,'#263f42',28)
 ],'A refined landscape business card with an architectural monogram.'),
 original('creative-business-card','A bright introduction','Business card',1050,600,'#ede5f8',['#ede5f8','#593a78','#d59aa4','#ecc06e'],[
  rect(0,0,376,600,'#593a78'),circle(79,84,230,'#ecc06e'),rect(86,286,216,126,'#d59aa4',{rx:63,ry:63,rotation:-14}),labelText('IDEAS\nIN GOOD\nCOMPANY',59,465,270,'#ede5f8',19,{lineHeight:1.2}),serif('Mina Park',432,90,556,59,'#593a78'),labelText('DESIGN & CREATIVE DIRECTION',436,192,549,'#593a78',16),rule(436,260,549,'#593a78'),text('Brand identities. Thoughtful stories.\nWork that connects.',436,303,549,25,'#593a78',{lineHeight:1.4}),text('hello@minapark.example\nminapark.example',436,447,549,22,'#593a78',{lineHeight:1.6})
 ],'A color-blocked creative business card with editable contact details.'),
 original('cv-clear-path','A clear career story','CV',1440,2036,'#ffffff',['#ffffff','#183a45','#d8e4e5','#617983'],[
  rect(0,0,413,2036,'#183a45'),circle(101,103,211,'#d8e4e5'),circle(159,136,94,'#617983'),rect(124,230,166,85,'#617983',{rx:65,ry:65}),text('CONTACT',64,400,295,25,'#ffffff',{fontWeight:700}),text('your.name@example.com\n+91 90000 00000\nportfolio.example\nYour city, India',64,460,295,23,'#d8e4e5',{lineHeight:1.75}),labelText('SKILLS',64,766,295,'#ffffff',25),text('Research & analysis\nProject coordination\nCommunication\nData visualization\nCreative problem solving',64,827,295,25,'#d8e4e5',{lineHeight:1.8}),labelText('EDUCATION',64,1256,295,'#ffffff',25),text('YOUR DEGREE\nYour university\n2024–2027\n\nRelevant coursework\nResearch methods\nBusiness analytics',64,1320,295,23,'#d8e4e5',{lineHeight:1.7}),serif('Your Name',480,114,871,91,'#183a45'),labelText('STRATEGY / RESEARCH / PRODUCT',485,260,859,'#617983',24),text('A concise professional summary explaining your focus,\nrelevant experience, and the value you bring to a team.',485,354,859,28,'#183a45',{lineHeight:1.5}),rule(485,510,859,'#d8e4e5'),labelText('EXPERIENCE',485,575,859,'#183a45',27),...['Your most recent role','Your previous role'].flatMap((title,i)=>[text(title,486,652+i*375,859,37,'#183a45',{fontWeight:700}),text('Organization name  /  Month Year–Month Year',486,713+i*375,859,23,'#617983'),text('• Describe a meaningful result with a verified measure.\n• Explain your contribution and the context.\n• Highlight a useful skill and a tangible outcome.',486,777+i*375,859,26,'#183a45',{lineHeight:1.65})]),rule(485,1445,859,'#d8e4e5'),labelText('SELECTED PROJECT',485,1513,859,'#183a45',27),text('Project title',486,1587,859,37,'#183a45',{fontWeight:700}),text('Describe the question you explored, the approach you used,\nand the result. Include a portfolio link where useful.',486,1658,859,28,'#183a45',{lineHeight:1.6}),text('Interests / Add two or three specific, relevant interests.',486,1889,859,24,'#617983')
 ],'A structured one-page CV with meaningful editing guidance and a calm sidebar.'),
 original('cv-editorial-profile','The editorial profile','CV',1440,2036,'#faf6ee',['#faf6ee','#463e35','#c3b297','#81766a'],[
  labelText('CURRICULUM VITAE',93,84,1252,'#81766a',21),serif('Your\nName.',86,174,1245,122,'#463e35'),text('YOUR ROLE / YOUR AREA OF FOCUS',96,471,1237,25,'#81766a',{letterSpacing:80}),rule(96,551,1247,'#c3b297'),text('your.name@example.com  ·  portfolio.example  ·  Your city',96,590,1247,25,'#463e35'),labelText('PROFILE',96,728,283,'#81766a',26),text('Two or three clear sentences about your experience,\nstrengths, and the work you want to do next.\nUse specific evidence and keep it easy to read.',457,719,887,30,'#463e35',{lineHeight:1.6}),rule(95,937,1249,'#c3b297'),labelText('EXPERIENCE',96,1000,290,'#81766a',26),text('Role title / Organization',457,991,887,38,'#463e35',{fontWeight:700}),text('MONTH YEAR–MONTH YEAR',459,1054,885,22,'#81766a'),text('• A concise achievement with a verified outcome.\n• Your responsibility, scope, and contribution.\n• A second result that shows a different strength.',457,1121,887,27,'#463e35',{lineHeight:1.7}),rule(95,1375,1249,'#c3b297'),labelText('EDUCATION',96,1438,290,'#81766a',26),serif('Your degree / Your university',457,1424,887,38,'#463e35'),text('Graduation year  ·  Relevant modules or distinctions',459,1493,885,26,'#81766a'),rule(95,1604,1249,'#c3b297'),labelText('SKILLS',96,1671,290,'#81766a',26),text('Research & analysis  /  Communication\nProject management  /  Your specialist tools',457,1659,887,30,'#463e35',{lineHeight:1.6}),labelText('PORTFOLIO / SELECTED WORK AVAILABLE ON REQUEST',96,1945,1247,'#81766a',18)
 ],'A type-led CV with a clear reading order and no decorative skill ratings.'),
 original('birthday-good-company','Another year of good company','Invitation',1080,1350,'#fbe7dc',['#fbe7dc','#8d3b49','#e2a855','#cc8091'],[
  circle(707,85,197,'#e2a855'),circle(846,245,143,'#cc8091'),rect(799,270,3,181,'#8d3b49',{rotation:9}),rect(908,384,3,135,'#8d3b49',{rotation:-7}),labelText('YOU ARE INVITED',73,74,870,'#8d3b49',21),serif('Another year\nof good\ncompany.',66,288,935,109,'#8d3b49'),text('Join us to celebrate',75,748,930,34,'#8d3b49'),serif('Avery’s birthday',73,824,930,58,'#8d3b49'),rule(77,950,926,'#cc8091'),text('SATURDAY 21 NOVEMBER  ·  6 PM\nTHE GARDEN HOUSE, 24 ORCHARD LANE',78,1004,924,25,'#8d3b49',{lineHeight:1.7}),labelText('BRING YOURSELF. WE WILL BRING THE CAKE.',77,1223,926,'#8d3b49',17)
 ],'A joyful birthday invitation with drawn balloons and clear venue information.'),
 original('wedding-garden-vows','Vows in the garden','Invitation',1080,1350,'#edf0e3',['#edf0e3','#38533e','#a7b594','#dfc6a7'],[
  rect(109,89,862,1173,'transparent',{stroke:'#a7b594',strokeWidth:3,rx:420,ry:420}),...[[136,309,-22],[179,377,-40],[821,322,28],[789,394,47]].map(([x,y,r])=>rect(x,y,49,115,'#a7b594',{rx:25,ry:25,rotation:r})),labelText('WITH THEIR FAMILIES',214,277,650,'#38533e',20,{align:'center'}),serif('Sam\n& Riley',161,425,758,120,'#38533e',{align:'center',lineHeight:1.03}),text('REQUEST THE PLEASURE OF YOUR COMPANY\nAS THEY BEGIN THEIR NEXT CHAPTER',180,756,720,21,'#38533e',{align:'center',lineHeight:1.7,letterSpacing:60}),rule(395,916,290,'#a7b594'),text('SATURDAY, 28 NOVEMBER\nFOUR O’CLOCK IN THE AFTERNOON',217,968,646,24,'#38533e',{align:'center',lineHeight:1.7}),serif('The Botanical House',183,1124,713,34,'#38533e',{align:'center',fontStyle:'italic'})
 ],'A restrained botanical wedding invitation with editable names and details.'),
 original('gallery-new-perspectives','New perspectives','Invitation',1080,1350,'#f6f1ec',['#f6f1ec','#2b2726','#cd553d'],[
  labelText('STUDIO NINE / EXHIBITION OPENING',72,65,934,'#2b2726',19),rect(820,175,184,290,'#cd553d'),circle(839,317,165,'#2b2726'),serif('New\nperspectives.',61,276,956,110,'#2b2726'),rule(74,722,929,'#2b2726'),text('A collection of works that asks\nus to look a little closer.',75,778,928,35,'#2b2726',{lineHeight:1.4}),labelText('OPENING RECEPTION',74,1017,928,'#cd553d',25),text('FRIDAY 20 NOVEMBER  ·  6–9 PM\nSTUDIO NINE, 42 KING STREET',75,1080,928,25,'#2b2726',{lineHeight:1.7}),labelText('ART / CONVERSATION / A DIFFERENT POINT OF VIEW',74,1271,927,'#2b2726',15)
 ],'A graphic gallery opening invitation with a red-and-ink visual motif.'),
 original('dinner-at-our-table','A place at our table','Invitation',1080,1350,'#eee1cc',['#eee1cc','#4d5137','#a7ac80','#c2875c'],[
  labelText('AN EVENING WITH FRIENDS',76,69,929,'#4d5137',22,{align:'center'}),serif('A place\nat our table.',67,241,944,115,'#4d5137',{align:'center'}),circle(365,653,348,'#a7ac80'),circle(399,687,280,'transparent',{stroke:'#eee1cc',strokeWidth:6}),rect(293,739,12,195,'#4d5137'),rect(765,739,12,195,'#4d5137'),...Array.from({length:3},(_,i)=>rect(284+i*13,689,8,78,'#4d5137')),text('Good food. Long stories. No occasion required.',91,1037,897,29,'#4d5137',{align:'center'}),rule(219,1112,640,'#c2875c'),text('SATURDAY 14 NOVEMBER  ·  7 PM\nTHE GARDEN HOUSE / RSVP TO YOUR HOST',110,1165,860,23,'#4d5137',{align:'center',lineHeight:1.7})
 ],'A friendly dinner invitation with an original editable place-setting illustration.'),
 original('five-small-actions','Five small actions','Infographic',1080,1528,'#f7f4ed',['#f7f4ed','#2d4650','#9fbabb','#deb47d','#c39faf'],[
  labelText('A GUIDE TO MAKING PROGRESS',75,65,928,'#2d4650',20),serif('Five small\nactions.',68,176,944,128,'#2d4650'),...['Ask a better question.|Start with what you need to understand.','Write it down.|Make the next step clear and concrete.','Try a small version.|Learn before you make it bigger.','Listen to the result.|Notice what worked and what changed.','Come back tomorrow.|Consistency turns effort into progress.'].flatMap((v,i)=>{const[a,b]=v.split('|');return[circle(77,498+i*171,95,['#9fbabb','#deb47d','#c39faf','#abc5a4','#dba191'][i]),text(String(i+1),86,523+i*171,77,38,'#2d4650',{align:'center',fontWeight:700}),text(a,207,502+i*171,793,35,'#2d4650',{fontWeight:700}),text(b,207,560+i*171,793,23,'#566b72')]}),rule(77,1405,926,'#9fbabb'),labelText('SMALL ENOUGH TO START. USEFUL ENOUGH TO REPEAT.',77,1455,926,'#2d4650',15)
 ],'An actual five-step infographic with clear, editable action text.'),
 original('budget-with-intention','A budget with intention','Infographic',1080,1350,'#eaf0ec',['#eaf0ec','#2c4a42','#84ab9c','#d9b66f','#b694ae'],[
  labelText('YOUR MONEY / YOUR PRIORITIES',75,67,927,'#2c4a42',20),serif('A budget\nwith intention.',66,177,947,111,'#2c4a42'),circle(86,565,440,'#84ab9c'),circle(135,614,342,'#eaf0ec'),text('100%',143,736,326,86,'#2c4a42',{align:'center',fontWeight:700}),...['50%|Essentials|Housing, food, everyday needs','30%|Your life|Experiences and things you enjoy','20%|Your future|Saving, investing, building a buffer'].flatMap((v,i)=>{const[a,b,c]=v.split('|');return[circle(578,599+i*169,27,['#84ab9c','#d9b66f','#b694ae'][i]),text(a,628,584+i*169,374,37,'#2c4a42',{fontWeight:700}),text(b,628,635+i*169,374,26,'#2c4a42'),text(c,628,679+i*169,374,19,'#627b6e')]}),rule(78,1113,924,'#84ab9c'),text('An illustrative starting point, not a rule.\nAdjust the split to fit your own needs and goals.',79,1172,921,27,'#2c4a42',{lineHeight:1.45})
 ],'A simple budget explainer with editable percentages and a clear illustrative note.'),
 original('field-notes-newsletter','Field notes, issue one','Newsletter',1440,1920,'#f7f3e9',['#f7f3e9','#3e4c3f','#bdc9b1','#c89171'],[
  labelText('ISSUE 01 / NOVEMBER 2026',82,66,1276,'#3e4c3f',21),serif('Field notes.',76,158,1289,144,'#3e4c3f'),text('A little curiosity for the everyday.',84,345,1272,36,'#3e4c3f'),rule(83,440,1273,'#3e4c3f'),rect(83,505,1273,472,'#bdc9b1',{rx:14,ry:14}),circle(842,566,344,'#f7f3e9'),rect(959,838,30,139,'#3e4c3f',{rotation:12}),rect(871,739,137,47,'#3e4c3f',{rx:23,ry:23,rotation:20}),serif('The art of\nnoticing.',123,614,727,78,'#3e4c3f'),labelText('THIS MONTH’S LETTER',85,1052,1271,'#3e4c3f',25),serif('Look a little closer.',83,1121,1272,63,'#3e4c3f'),text('There are useful stories in the places we pass every day.\nThis month, we are making space to notice them: the familiar\nroutine, the surprising detail, and the question worth asking.',86,1249,1268,30,'#3e4c3f',{lineHeight:1.65}),rule(83,1490,1273,'#c89171'),labelText('ON OUR RADAR',84,1554,590,'#3e4c3f',25),labelText('A QUESTION TO KEEP',751,1554,605,'#3e4c3f',25),text('A book that changes your perspective.\nA walk without a destination.\nA conversation with someone new.',85,1623,590,25,'#3e4c3f',{lineHeight:1.6}),text('What did you notice today\nthat you might have missed\nyesterday?',751,1623,605,28,'#3e4c3f',{lineHeight:1.5}),labelText('FIELDNOTES.EXAMPLE / MORE TO COME NEXT MONTH',85,1850,1270,'#3e4c3f',17)
 ],'A complete one-page newsletter with a lead story and two readable lower columns.'),
 original('creative-guide-thumbnail','Make your next good idea','YouTube',1920,1080,'#33295d',['#33295d','#fcf4d9','#efb259','#b6a4e5'],[
  circle(1248,104,606,'#b6a4e5'),rect(1350,224,406,593,'#fcf4d9',{rx:47,ry:47,rotation:-10}),rect(1397,300,296,72,'#efb259',{rx:12,ry:12,rotation:-10}),rect(1421,431,263,25,'#b6a4e5',{rx:12,ry:12,rotation:-10}),rect(1442,491,216,25,'#b6a4e5',{rx:12,ry:12,rotation:-10}),labelText('THE CREATIVE FIELD GUIDE',86,72,1680,'#fcf4d9',27),text('MAKE YOUR\nNEXT GOOD\nIDEA.',80,250,1250,147,'#fcf4d9',{fontWeight:900,lineHeight:.98}),rect(92,842,811,105,'#efb259',{rx:15,ry:15}),labelText('5 SIMPLE WAYS TO GET STARTED',121,881,747,'#33295d',27),text('A practical guide to creative momentum',92,1000,1680,29,'#fcf4d9')
 ],'A bold, legible video thumbnail with a fully editable notebook illustration.'),
 original('certificate-quiet-achievement','An achievement worth celebrating','Certificate',1920,1357,'#fbf7ed',['#fbf7ed','#304846','#bda46c','#e2d7bd'],[
  rect(56,56,1808,1245,'transparent',{stroke:'#bda46c',strokeWidth:3}),rect(76,76,1768,1205,'transparent',{stroke:'#e2d7bd',strokeWidth:2}),circle(854,159,208,'#e2d7bd'),text('V',877,199,162,92,'#304846',{align:'center',fontFamily:'Georgia'}),labelText('CERTIFICATE OF COMPLETION',156,452,1609,'#304846',33,{align:'center'}),serif('An achievement\nworth celebrating.',145,548,1625,91,'#304846',{align:'center',lineHeight:1.13}),text('Presented to',153,817,1614,28,'#304846',{align:'center'}),serif('Your Name',151,887,1618,79,'#304846',{align:'center'}),text('For completing the program with curiosity, commitment, and care.',154,1010,1612,27,'#304846',{align:'center'}),rule(256,1150,475,'#bda46c'),rule(1190,1150,475,'#bda46c'),labelText('PROGRAM DIRECTOR',255,1183,478,'#304846',19,{align:'center'}),labelText('DATE / ORGANIZATION',1190,1183,475,'#304846',19,{align:'center'})
 ],'A landscape certificate with editable recipient, program and signature lines.'),
];

export const TEMPLATES: DesignTemplate[] = [...STARTER_TEMPLATES,...ORIGINAL_TEMPLATES];

export const TEMPLATE_CATEGORIES = [
  "All",
  ...new Set(TEMPLATES.map((template) => template.category)),
];

export function getTemplate(id: string): DesignTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
