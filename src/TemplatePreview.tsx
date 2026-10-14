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
              ) : e.type === "circle" ? (
                <ellipse
                  cx={w / 2}
                  cy={h / 2}
                  rx={w / 2}
                  ry={h / 2}
                  fill={e.fill}
                />
              ) : e.type === "triangle" ? (
                <polygon points={`${w / 2},0 ${w},${h} 0,${h}`} fill={e.fill} />
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
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
});
