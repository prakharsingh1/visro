import {memo} from "react";
import {TEMPLATES} from "./templates";
export const TemplatePreview = memo(function TemplatePreview({
  template,
  index,
}: {
  template: (typeof TEMPLATES)[number];
  index: number;
}) {
  return (
    <div
      className="template-preview"
      style={{ background: template.background, padding: 0 }}
    >
      <svg
        viewBox={`0 0 ${template.width} ${template.height}`}
        role="img"
        aria-label={`${template.name} preview`}
      >
        <rect
          width={template.width}
          height={template.height}
          fill={template.background}
        />
        {template.elements.map((e, i) => {
          const w = e.width || 200,
            h = e.height || w,
            transform = `translate(${e.x} ${e.y}) rotate(${e.rotation || 0})`;
          return (
            <g
              key={`${index}-${i}`}
              transform={transform}
              opacity={e.opacity ?? 1}
            >
              {e.type === "text" ? (
                <text
                  fill={e.fill}
                  fontSize={e.fontSize}
                  fontFamily={e.fontFamily || "Arial"}
                  fontWeight={e.fontWeight}
                  fontStyle={e.fontStyle}
                  letterSpacing={(e.letterSpacing || 0) * (e.fontSize || 32) / 1000}
                  textAnchor={
                    e.align === "center"
                      ? "middle"
                      : e.align === "right"
                        ? "end"
                        : "start"
                  }
                  x={e.align === "center" ? w / 2 : e.align === "right" ? w : 0}
                >
                  {(e.text || "").split("\n").map((line, n) => (
                    <tspan
                      key={n}
                      x={
                        e.align === "center"
                          ? w / 2
                          : e.align === "right"
                            ? w
                            : 0
                      }
                      y={
                        (e.fontSize || 32) * (0.88 + n * (e.lineHeight || 1.05))
                      }
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              ) : e.type === "image" && e.src ? (
                <image
                  href={e.src}
                  width={w}
                  height={h}
                  preserveAspectRatio={e.imageFit === "contain" ? "xMidYMid meet" : "xMidYMid slice"}
                  aria-label={e.name || "Template photograph"}
                />
              ) : e.type === "circle" ? (
                <ellipse
                  cx={w / 2}
                  cy={h / 2}
                  rx={w / 2}
                  ry={h / 2}
                  fill={e.fill}
                  stroke={e.stroke}
                  strokeWidth={e.strokeWidth}
                />
              ) : e.type === "triangle" ? (
                <polygon points={`${w / 2},0 ${w},${h} 0,${h}`} fill={e.fill} stroke={e.stroke} strokeWidth={e.strokeWidth} />
              ) : e.type === "star" ? (
                <polygon points={Array.from({length:10},(_,n)=>{const a=n*Math.PI/5-Math.PI/2,r=n%2?.42:1;return `${w/2+Math.cos(a)*w/2*r},${h/2+Math.sin(a)*h/2*r}`;}).join(' ')} fill={e.fill} stroke={e.stroke} strokeWidth={e.strokeWidth} />
              ) : e.type === "line" ? (
                <line
                  x1="0"
                  y1="0"
                  x2={w}
                  y2={h === w ? 0 : h}
                  stroke={e.stroke || e.fill}
                  strokeWidth={e.strokeWidth || 3}
                />
              ) : (
                <rect
                  width={w}
                  height={h}
                  fill={e.fill}
                  rx={e.rx || 0}
                  ry={e.ry || 0}
                  stroke={e.stroke}
                  strokeWidth={e.strokeWidth}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
});
