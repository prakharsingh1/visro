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

export const TEMPLATES: DesignTemplate[] = [
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

export const TEMPLATE_CATEGORIES = [
  "All",
  ...new Set(TEMPLATES.map((template) => template.category)),
];

export function getTemplate(id: string): DesignTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
