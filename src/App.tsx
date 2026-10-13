import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Grid2X2,
  Group,
  Image as ImageIcon,
  Layers,
  LoaderCircle,
  Lock,
  Maximize2,
  Minus,
  MousePointer2,
  Paintbrush,
  Palette,
  Plus,
  Redo2,
  Search,
  Settings2,
  Shapes,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  Unlock,
  Upload,
  WandSparkles,
  X,
  FlipHorizontal,
  FlipVertical,
  Scissors,
  AlignLeft,
  AlignCenter,
  AlignRight,
  SlidersHorizontal,
  Save,
  ExternalLink,
  LayoutTemplate,
  CheckCircle2,
  Triangle,
  Star,
  Pencil,
  MoveUpRight,
  Presentation,
  Link,
  ZoomIn,
} from "lucide-react";
import { StudioEditor } from "./editor";
import { TEMPLATES } from "./templates";
import { createProject } from "./project";
import type { EditorState, SelectionState } from "./editor-types";
import { removeImageBackground } from "./background";
import {
  desktop,
  DEFAULT_SETTINGS,
  saveExport,
  saveProjectFallback,
  type AIResult,
  type Settings,
} from "./bridge";
import {
  listDesigns,
  storeDesign,
  deleteDesign,
  type SavedDesign,
} from "./storage";

type Panel =
  "templates" | "elements" | "text" | "uploads" | "ai" | "brand" | "draw";
type AIKind = "design" | "image" | "edit" | "copy";
type Modal = "settings" | "export" | "resize" | "library" | "present" | null;
const COLORS = [
  "#ed704d",
  "#f8c8dc",
  "#f6f2e9",
  "#252922",
  "#a9b99b",
  "#8e65cf",
  "#f2cd6e",
  "#ffffff",
  "#000000",
];
const FONTS = [
  "Arial",
  "Helvetica",
  "Georgia",
  "Times New Roman",
  "Verdana",
  "Trebuchet MS",
  "Courier New",
];
const PRESETS = [
  { name: "Instagram post", w: 1080, h: 1080 },
  { name: "Instagram story", w: 1080, h: 1920 },
  { name: "Presentation", w: 1920, h: 1080 },
  { name: "A4 document", w: 794, h: 1123 },
  { name: "YouTube thumbnail", w: 1280, h: 720 },
  { name: "LinkedIn post", w: 1200, h: 1200 },
  { name: "Business card", w: 1050, h: 600 },
  { name: "Poster", w: 1600, h: 2000 },
];
const initialState = {
  width: 1080,
  height: 1080,
  zoom: 0.5,
  canUndo: false,
  canRedo: false,
  pages: [],
  activePageId: "",
  layers: [],
  background: "#f6f2e9",
  name: "Make room for your next idea",
} as unknown as EditorState;
const safeName = (s: string) =>
  s.replace(/[\\/:*?"<>|]/g, "-").trim() || "Visro design";
function IconButton({
  children,
  title,
  onClick,
  disabled = false,
  active = false,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""}`}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const value = Number(e.target.value);
          if (Number.isFinite(value)) onChange(value);
        }}
      />
    </label>
  );
}
function TemplatePreview({
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
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    viewportRef = useRef<HTMLDivElement>(null),
    engine = useRef<StudioEditor | null>(null),
    uploadRef = useRef<HTMLInputElement>(null),
    projectRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<EditorState>(initialState),
    [selected, setSelected] = useState<SelectionState | null>(null),
    [panel, setPanel] = useState<Panel>("templates"),
    [modal, setModal] = useState<Modal>(null),
    [name, setName] = useState("Make room for your next idea"),
    [dirty, setDirty] = useState(false),
    [ready, setReady] = useState(false),
    [search, setSearch] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(""),
    [busyPercent, setBusyPercent] = useState(0),
    [uploads, setUploads] = useState<string[]>([]),
    [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS),
    [aiKind, setAiKind] = useState<AIKind>("design"),
    [prompt, setPrompt] = useState(""),
    [aiResult, setAIResult] = useState<AIResult | null>(null),
    [brand, setBrand] = useState({
      colors: COLORS.slice(0, 5),
      fonts: ["Georgia", "Arial"],
    }),
    [drawColor, setDrawColor] = useState("#ed704d"),
    [drawWidth, setDrawWidth] = useState(8),
    [drawing, setDrawing] = useState(false),
    [library, setLibrary] = useState<SavedDesign[]>([]),
    [exportFormat, setExportFormat] = useState("png"),
    [exportScale, setExportScale] = useState(2),
    [transparent, setTransparent] = useState(false),
    [size, setSize] = useState({ w: 1080, h: 1080 }),
    [presentImage, setPresentImage] = useState(""),
    [presentIndex, setPresentIndex] = useState(0);
  const [apiKey, setApiKey] = useState(""),
    [textModel, setTextModel] = useState(DEFAULT_SETTINGS.textModel),
    [imageModel, setImageModel] = useState(DEFAULT_SETTINGS.imageModel),
    [models, setModels] = useState<
      Array<{ name: string; displayName?: string }>
    >([]),
    [settingsError, setSettingsError] = useState("");
  const activeId = useRef(
      localStorage.getItem("visro-active-design") || crypto.randomUUID(),
    ),
    nameRef = useRef(name),
    saving = useRef(false),
    nativeSavedId = useRef<string | null>(null),
    errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setToast(""), 6000);
  }, []);
  const work = useCallback(
    async (label: string, job: () => Promise<unknown>) => {
      setBusy(label);
      setBusyPercent(0);
      try {
        return await job();
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
        );
      } finally {
        setBusy("");
        setBusyPercent(0);
      }
    },
    [notify],
  );
  useEffect(() => {
    nameRef.current = name;
  }, [name]);
  useEffect(() => {
    if (!canvasRef.current || !viewportRef.current) return;
    let alive = true;
    const studio = new StudioEditor(canvasRef.current, {
      onChange: (s) => {
        if (alive) {
          setState({ ...s });
          setBrand(s.brand);
          setDirty(s.dirty);
        }
      },
      onSelection: (s) => {
        if (alive) setSelected(s ? { ...s } : null);
      },
    });
    engine.current = studio;
    const resize = () => {
      const r = viewportRef.current!.getBoundingClientRect();
      studio.resizeViewport(r.width, r.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewportRef.current);
    (async () => {
      try {
        const saved = await listDesigns();
        const current = saved.find((s) => s.id === activeId.current);
        if (current) {
          await studio.loadProject(
            current.project as Parameters<StudioEditor["loadProject"]>[0],
          );
          setName(current.name);
        } else await studio.loadTemplate(TEMPLATES[0].id);
        resize();
        studio.fit();
        if (alive) setReady(true);
      } catch (e) {
        notify(
          e instanceof Error ? e.message : "Could not restore the design.",
        );
      }
    })();
    return () => {
      alive = false;
      observer.disconnect();
      studio.destroy();
      engine.current = null;
      clearTimeout(errorTimer.current);
    };
  }, [notify]);
  useEffect(() => {
    if (!ready || !engine.current) return;
    const timer = setTimeout(async () => {
      try {
        await storeDesign({
          id: activeId.current,
          name,
          updated: Date.now(),
          project: engine.current!.serialize(name),
        });
        setDirty(false);
      } catch {
        notify("Autosave is unavailable. Use Save to keep a project file.");
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [state, name, ready, notify]);
  useEffect(() => {
    if (desktop)
      desktop
        .getSettings()
        .then((s) => {
          setSettings(s);
          setTextModel(s.textModel);
          setImageModel(s.imageModel);
        })
        .catch((e) => notify(e.message));
  }, [notify]);
  const save = useCallback(async () => {
    if (!engine.current || saving.current) return;
    saving.current = true;
    await work("Saving your design", async () => {
      const project = engine.current!.serialize(nameRef.current);
      if (desktop) {
        const result = await desktop.saveProject({
          project,
          name: nameRef.current,
          saveAs: nativeSavedId.current !== activeId.current,
        });
        if (result) {
          nativeSavedId.current = activeId.current;
          notify("Project saved. You can open it again in Visro.");
        }
      } else {
        await saveProjectFallback(project, safeName(nameRef.current));
        notify("Project file downloaded.");
      }
      setDirty(false);
    });
    saving.current = false;
  }, [notify, work]);
  const open = useCallback(async () => {
    if (desktop)
      await work("Opening your project", async () => {
        const result = await desktop!.openProject();
        if (result) {
          const doc = result.project as Parameters<
            StudioEditor["loadProject"]
          >[0];
          await engine.current!.loadProject(doc);
          activeId.current = crypto.randomUUID();
          nativeSavedId.current = activeId.current;
          setName((doc as { name?: string }).name || "Untitled design");
          notify("Project opened.");
        }
      });
    else projectRef.current?.click();
  }, [notify, work]);
  const newDesign = useCallback(async () => {
    activeId.current = crypto.randomUUID();
    setName("Untitled design");
    await engine.current?.loadProject(
      createProject("Untitled design", 1080, 1080, "#ffffff"),
    );
    notify("A fresh canvas, ready for your next idea.");
  }, [notify]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input,textarea,select,[contenteditable="true"]'))
        return;
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (cmd && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void open();
      } else if (cmd && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? engine.current?.redo() : engine.current?.undo();
      } else if (cmd && e.key.toLowerCase() === "d") {
        e.preventDefault();
        engine.current?.duplicate();
      } else if ((e.key === "Backspace" || e.key === "Delete") && !e.metaKey) {
        e.preventDefault();
        engine.current?.remove();
      } else if (e.key === "Escape") {
        setModal(null);
        setDrawing(false);
        engine.current?.setDrawing(false);
      } else if (e.key === "t" && !cmd) engine.current?.addText("heading");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [save, open]);
  useEffect(() => {
    if (!desktop) return;
    return desktop.onMenu((action) => {
      if (action === "save") void save();
      else if (action === "open") void open();
      else if (action === "new") void newDesign();
      else if (action === "export") setModal("export");
      else if (action === "save-as") {
        nativeSavedId.current = null;
        void save();
      } else if (action === "zoom-in")
        engine.current?.setZoom(state.zoom + 0.1);
      else if (action === "zoom-out") engine.current?.setZoom(state.zoom - 0.1);
      else if (action === "fit") engine.current?.fit();
      else if (action === "settings") setModal("settings");
      else if (action === "undo") engine.current?.undo();
      else if (action === "redo") engine.current?.redo();
    });
  }, [save, open, newDesign]);
  const choosePanel = (p: Panel) => {
    setPanel(p);
    setSearch("");
    if (p !== "draw") {
      setDrawing(false);
      engine.current?.setDrawing(false);
    }
  };
  const useTemplate = (id: string, templateName: string) =>
    void work("Setting up your canvas", async () => {
      activeId.current = crypto.randomUUID();
      await engine.current!.loadTemplate(id);
      setName(templateName);
    });
  const uploadFiles = async (files: FileList | null) => {
    if (!files) return;
    await work("Adding your images", async () => {
      for (const file of Array.from(files)) {
        if (
          !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            file.type,
          )
        ) {
          notify("Choose a PNG, JPG, WebP, or GIF image.");
          continue;
        }
        if (file.size > 30 * 1024 * 1024)
          throw new Error("Choose an image smaller than 30 MB.");
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read the image."));
          reader.readAsDataURL(file);
        });
        setUploads((s) => [data, ...s]);
        await engine.current!.addImage(data);
      }
    });
  };
  const removeBackground = () =>
    void work("Preparing background removal", async () => {
      const current = engine.current?.getSelected();
      if (!current || current.type !== "image")
        throw new Error("Select an image first.");
      const original = await engine.current!.selectedImageDataURL();
      const data = await removeImageBackground(original, (label, percent) => {
        setBusy(label);
        setBusyPercent(percent);
      });
      await engine.current!.replaceSelectedImage(data);
      notify("Background removed. Your image now has true transparency.");
    });
  const runAI = () =>
    void work(
      aiKind === "design"
        ? "Gemini is designing your idea"
        : aiKind === "copy"
          ? "Gemini is writing"
          : "Gemini is creating your image",
      async () => {
        if (!desktop)
          throw new Error("Open the Visro Mac app to connect your Gemini key.");
        if (!settings.hasKey) {
          setModal("settings");
          throw new Error("Add your Gemini key in settings first.");
        }
        if (!prompt.trim())
          throw new Error("Describe what you want to create.");
        let image: string | undefined;
        if (aiKind === "edit") {
          if (selected?.type !== "image")
            throw new Error("Select an image on the canvas to edit.");
          image = await engine.current!.selectedImageDataURL();
        }
        const result = await desktop.runAI({
          kind: aiKind,
          prompt,
          width: state.width,
          height: state.height,
          ...(image ? { image } : {}),
        });
        setAIResult(result);
      },
    );
  const applyAI = () =>
    void work("Adding your creation", async () => {
      if (aiResult?.design) {
        await engine.current!.addPage();
        await engine.current!.insertDesign(
          aiResult.design as unknown as Parameters<
            StudioEditor["insertDesign"]
          >[0],
        );
        notify("AI design added as a new editable page.");
      } else if (aiResult?.image) {
        await engine.current!.addImage(aiResult.image);
        setUploads((s) => [aiResult.image!, ...s]);
        notify("Image added to your canvas.");
      } else if (aiResult?.text) {
        engine.current!.addText("body");
        engine.current!.updateSelected({ text: aiResult.text });
        notify("Writing added to your canvas.");
      }
    });
  const exportDesign = () =>
    void work("Exporting your design", async () => {
      if (exportFormat === "pdf") {
        const { jsPDF } = await import("jspdf");
        const pages = await engine.current!.exportPages(1.5);
        const first = pages[0];
        const pdf = new jsPDF({
          orientation: first.width > first.height ? "landscape" : "portrait",
          unit: "px",
          format: [first.width, first.height],
          hotfixes: ["px_scaling"],
          compress: true,
        });
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          if (i)
            pdf.addPage(
              [page.width, page.height],
              page.width > page.height ? "landscape" : "portrait",
            );
          pdf.addImage(
            page.dataURL,
            "PNG",
            0,
            0,
            page.width,
            page.height,
            undefined,
            "FAST",
          );
        }
        await saveExport(
          safeName(name),
          "pdf",
          pdf.output("datauristring").replace(/;filename=[^;]+;/, ";"),
        );
      } else {
        const data = await engine.current!.exportImage({
          format: exportFormat as "png" | "jpeg" | "svg",
          scale: exportScale,
          transparent,
        });
        await saveExport(safeName(name), exportFormat, data);
      }
      setModal(null);
      notify("Your design is ready.");
    });
  const showLibrary = () =>
    void work("Opening your projects", async () => {
      setLibrary(await listDesigns());
      setModal("library");
    });
  const showPresent = () =>
    void work("Preparing presentation", async () => {
      setPresentImage(
        await engine.current!.exportImage({
          format: "png",
          scale: 1,
          transparent: false,
        }),
      );
      setPresentIndex(
        state.pages.findIndex((p) => p.id === state.activePageId),
      );
      setModal("present");
    });
  const movePresent = async (direction: number) => {
    const index = Math.max(
      0,
      Math.min(state.pages.length - 1, presentIndex + direction),
    );
    await engine.current!.setPage(state.pages[index].id);
    setPresentIndex(index);
    setPresentImage(
      await engine.current!.exportImage({
        format: "png",
        scale: 1,
        transparent: false,
      }),
    );
  };
  const update = (changes: Parameters<StudioEditor["updateSelected"]>[0]) =>
    engine.current?.updateSelected(changes);
  const nav = [
    { id: "templates" as const, label: "Design", Icon: LayoutTemplate },
    { id: "elements" as const, label: "Elements", Icon: Shapes },
    { id: "text" as const, label: "Text", Icon: Type },
    { id: "uploads" as const, label: "Uploads", Icon: Upload },
    { id: "ai" as const, label: "Visro AI", Icon: Sparkles },
    { id: "brand" as const, label: "Brand", Icon: Palette },
    { id: "draw" as const, label: "Draw", Icon: Paintbrush },
  ];
  return (
    <div className="studio-app">
      <header className="topbar">
        <button
          className="wordmark"
          onClick={() => void showLibrary()}
          title="Your projects"
        >
          <span className="logo-mark">v</span>
          <span>
            visro<span className="wordmark-dot">.</span>
          </span>
        </button>
        <span className="top-divider" />
        <div className="document-title">
          <input
            aria-label="Design name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
          />
          <span className="save-state">
            {dirty ? (
              <>
                <span className="saving-dot" />
                Saving locally
              </>
            ) : (
              <>
                <Check size={12} />
                Saved locally
              </>
            )}
          </span>
        </div>
        <div className="top-actions">
          <button className="quiet-button" onClick={() => void open()}>
            <FolderOpen size={16} />
            <span>Open</span>
          </button>
          <IconButton title="Save project (⌘S)" onClick={() => void save()}>
            <Save size={17} />
          </IconButton>
          <IconButton
            title="Gemini settings"
            onClick={() => {
              setSettingsError("");
              setModal("settings");
            }}
          >
            <Settings2 size={18} />
          </IconButton>
          <button
            className="quiet-button present-button"
            onClick={() => void showPresent()}
          >
            <Presentation size={16} />
            Present
          </button>
          <button className="primary-button" onClick={() => setModal("export")}>
            <Download size={16} />
            Export
            <ChevronDown size={13} />
          </button>
          <span className="avatar">PS</span>
        </div>
      </header>
      <div className="workspace">
        <nav className="tool-rail" aria-label="Editor tools">
          {nav.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`rail-button ${panel === id ? "selected" : ""}`}
              onClick={() => choosePanel(id)}
            >
              <Icon size={22} strokeWidth={1.7} />
              <span>{label}</span>
              {id === "ai" && <span className="new-dot" />}
            </button>
          ))}
          <div className="rail-bottom">
            <IconButton
              title="Your saved projects"
              onClick={() => void showLibrary()}
            >
              <Grid2X2 size={20} />
            </IconButton>
          </div>
        </nav>
        <aside className="asset-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">YOUR CREATIVE SPACE</span>
              <h2>
                {panel === "templates"
                  ? "Start with a spark."
                  : panel === "elements"
                    ? "Make it yours."
                    : panel === "text"
                      ? "Words with character."
                      : panel === "uploads"
                        ? "Your visual world."
                        : panel === "ai"
                          ? "Meet your co-creator."
                          : panel === "brand"
                            ? "Distinctly you."
                            : "Leave your mark."}
              </h2>
            </div>
            {panel === "ai" ? (
              <Sparkles className="accent-icon" size={23} />
            ) : (
              <span className="tiny-star">✳</span>
            )}
          </div>
          {(panel === "templates" || panel === "elements") && (
            <label className="search-box">
              <Search size={16} />
              <input
                aria-label="Search templates or elements"
                placeholder={
                  panel === "templates"
                    ? "Find your starting point"
                    : "Search shapes"
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          )}
          {panel === "templates" && (
            <>
              <div className="chip-row">
                <button className="chip active" onClick={() => setSearch("")}>
                  For you
                </button>
                <button
                  className={`chip ${search === "social" ? "active" : ""}`}
                  onClick={() => setSearch("social")}
                >
                  Social
                </button>
                <button
                  className={`chip ${search === "presentation" ? "active" : ""}`}
                  onClick={() => setSearch("presentation")}
                >
                  Slides
                </button>
              </div>
              <div className="section-label">
                <span>Curated beginnings</span>
                <span>
                  {
                    TEMPLATES.filter(
                      (t) =>
                        !search ||
                        `${t.name} ${t.category}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    ).length
                  }
                </span>
              </div>
              <div className="template-grid">
                {TEMPLATES.filter(
                  (t) =>
                    !search ||
                    `${t.name} ${t.category}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                ).map((t) => (
                  <button
                    className="template-card"
                    key={t.id}
                    onClick={() => useTemplate(t.id, t.name)}
                  >
                    <TemplatePreview
                      template={t}
                      index={TEMPLATES.indexOf(t)}
                    />
                    <div className="template-meta">
                      <span>{t.name}</span>
                      <ArrowUpRight size={13} />
                    </div>
                    <small>
                      {t.width} × {t.height}
                    </small>
                  </button>
                ))}
              </div>
              <button
                className="blank-card"
                onClick={() => {
                  setSize({ w: 1080, h: 1080 });
                  setModal("resize");
                }}
              >
                <Plus size={19} />
                <span>Create at your own size</span>
                <ArrowUpRight size={14} />
              </button>
              <div className="local-note">
                <span className="local-note-icon">
                  <Lock size={14} />
                </span>
                <div>
                  <strong>A space that's yours.</strong>
                  <span>Projects stay on this Mac. Create freely.</span>
                </div>
              </div>
            </>
          )}
          {panel === "elements" && (
            <>
              <div className="section-label">Shapes & lines</div>
              <div className="shape-grid">
                {[
                  { type: "rect", name: "Rectangle", Icon: Square },
                  { type: "circle", name: "Circle", Icon: Circle },
                  { type: "triangle", name: "Triangle", Icon: Triangle },
                  { type: "star", name: "Star", Icon: Star },
                  { type: "line", name: "Line", Icon: Minus },
                ]
                  .filter((v) =>
                    v.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map(({ type, name: label, Icon }) => (
                    <button
                      className="shape-card"
                      key={type}
                      onClick={() =>
                        engine.current?.addShape(
                          type as Parameters<StudioEditor["addShape"]>[0],
                        )
                      }
                    >
                      <Icon size={36} />
                      <span>{label}</span>
                    </button>
                  ))}
              </div>
              <div className="section-label">Quick compositions</div>
              <button
                className="composition-card"
                onClick={() => {
                  engine.current?.addShape("circle");
                  update({ fill: "#f8c8dc", width: 440, height: 440 });
                }}
              >
                <span className="composition-orb" />
                <span>
                  Soft circle<span>A little colour, a lot of character.</span>
                </span>
                <Plus size={16} />
              </button>
              <button
                className="composition-card"
                onClick={() => {
                  engine.current?.addShape("rect");
                  update({
                    fill: "#ed704d",
                    width: 600,
                    height: 90,
                    angle: -8,
                  });
                }}
              >
                <span className="composition-line" />
                <span>
                  Statement strip<span>Make a headline pop.</span>
                </span>
                <Plus size={16} />
              </button>
              <div className="help-card">
                <MousePointer2 size={19} />
                <p>
                  Drag to move. Pull a corner to scale. Use the right panel for
                  precise control.
                </p>
              </div>
            </>
          )}
          {panel === "text" && (
            <>
              <button
                className="full-button dark"
                onClick={() => engine.current?.addText("body")}
              >
                <Plus size={17} />
                Add a text box
              </button>
              <div className="section-label">Type something good</div>
              <button
                className="text-preset heading"
                onClick={() => engine.current?.addText("heading")}
              >
                A big idea.
                <Plus size={18} />
              </button>
              <button
                className="text-preset subheading"
                onClick={() => engine.current?.addText("subheading")}
              >
                Give it a little context.
                <Plus size={17} />
              </button>
              <button
                className="text-preset body"
                onClick={() => engine.current?.addText("body")}
              >
                And tell your story, one line at a time.
                <Plus size={16} />
              </button>
              <div className="section-label">Font pairings</div>
              <button
                className="type-pair"
                onClick={() => {
                  engine.current?.addText("heading");
                  update({
                    fontFamily: "Georgia",
                    text: "Beautifully simple.",
                  });
                }}
              >
                <span className="serif">
                  Beautifully
                  <br />
                  simple.
                </span>
                <span>GEORGIA + ARIAL</span>
                <ArrowUpRight size={17} />
              </button>
              <button
                className="type-pair mono"
                onClick={() => {
                  engine.current?.addText("heading");
                  update({
                    fontFamily: "Courier New",
                    text: "IDEAS\nIN MOTION.",
                  });
                }}
              >
                <span>
                  IDEAS
                  <br />
                  IN MOTION.
                </span>
                <span>COURIER NEW</span>
                <ArrowUpRight size={17} />
              </button>
              <div className="help-card">
                <Type size={18} />
                <p>
                  Double-click text on the canvas to write. Press T to add a new
                  heading.
                </p>
              </div>
            </>
          )}
          {panel === "uploads" && (
            <>
              <button
                className="full-button dark"
                onClick={() => uploadRef.current?.click()}
              >
                <Upload size={17} />
                Upload images
              </button>
              <div
                className="dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void uploadFiles(e.dataTransfer.files);
                }}
                onClick={() => uploadRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") uploadRef.current?.click();
                }}
              >
                <ImageIcon size={32} />
                <strong>Your images belong here.</strong>
                <span>
                  Drop an image, or click to browse.
                  <br />
                  PNG, JPG, WebP, GIF · up to 30 MB
                </span>
              </div>
              {uploads.length > 0 && (
                <>
                  <div className="section-label">This session</div>
                  <div className="upload-grid">
                    {uploads.map((src, i) => (
                      <button
                        key={i}
                        onClick={() => void engine.current?.addImage(src)}
                      >
                        <img src={src} alt={`Uploaded image ${i + 1}`} />
                        <span>
                          <Plus size={15} />
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="feature-card">
                <span className="feature-icon">
                  <Scissors size={19} />
                </span>
                <strong>Keep the subject. Lose the rest.</strong>
                <p>
                  Upload an image, select it, then remove its background in one
                  click.
                </p>
                <span className="feature-tag">
                  Runs locally · No API key needed
                </span>
              </div>
            </>
          )}
          {panel === "ai" && (
            <>
              <div className="ai-banner">
                <span className="ai-orb">✳</span>
                <div>
                  <strong>Your ideas. A little AI magic.</strong>
                  <span>Powered by your own Gemini key.</span>
                </div>
              </div>
              <div className="ai-tabs">
                {(["design", "image", "edit", "copy"] as const).map((k) => (
                  <button
                    key={k}
                    className={aiKind === k ? "active" : ""}
                    onClick={() => {
                      setAiKind(k);
                      setAIResult(null);
                    }}
                  >
                    {k === "copy" ? "Write" : k[0].toUpperCase() + k.slice(1)}
                  </button>
                ))}
              </div>
              <label className="prompt-label">
                {aiKind === "design"
                  ? "What are we making?"
                  : aiKind === "image"
                    ? "Picture something new."
                    : aiKind === "edit"
                      ? "What would you change?"
                      : "What should it say?"}
              </label>
              <textarea
                className="ai-prompt"
                aria-label="AI prompt"
                placeholder={
                  aiKind === "design"
                    ? "A warm, minimal coffee shop Instagram post. Big serif headline, earthy colours, lots of breathing room…"
                    : aiKind === "image"
                      ? "A cinematic photo of a ceramic coffee cup, morning light, terracotta backdrop…"
                      : aiKind === "edit"
                        ? "Replace the background with a soft peach studio backdrop. Keep the subject…"
                        : "Write a short, playful headline for a new sustainable coffee brand…"
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              {aiKind === "edit" && (
                <div className="small-hint">
                  <ImageIcon size={14} />
                  {selected?.type === "image"
                    ? "Selected image will be sent to Gemini."
                    : "Select an image on your canvas first."}
                </div>
              )}
              <button
                className="full-button coral"
                disabled={!!busy || !prompt.trim()}
                onClick={runAI}
              >
                <Sparkles size={17} />
                {aiKind === "design"
                  ? "Generate editable design"
                  : aiKind === "image"
                    ? "Generate image"
                    : aiKind === "edit"
                      ? "Edit selected image"
                      : "Write with Gemini"}
              </button>
              <div className="ai-suggestions">
                {(aiKind === "design"
                  ? [
                      "A bold product launch",
                      "A presentation cover",
                      "A restaurant menu",
                    ]
                  : aiKind === "copy"
                    ? [
                        "Make it shorter",
                        "Write 5 headlines",
                        "Find a brand tagline",
                      ]
                    : aiKind === "edit"
                      ? [
                          "Remove an object",
                          "Change the background",
                          "Restyle as a painting",
                        ]
                      : [
                          "Editorial still life",
                          "Dreamy landscape",
                          "Minimal product shot",
                        ]
                ).map((s) => (
                  <button key={s} onClick={() => setPrompt(s)}>
                    {s}
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </div>
              {aiResult && (
                <div className="ai-result">
                  <div className="section-label">
                    <span>Your creation</span>
                    <CheckCircle2 size={15} />
                  </div>
                  {aiResult.image && (
                    <img src={aiResult.image} alt="Gemini generated result" />
                  )}
                  {aiResult.design && (
                    <p>
                      <strong>{aiResult.design.name}</strong>
                      <br />
                      {aiResult.design.elements.length} editable elements ·{" "}
                      {aiResult.design.width} × {aiResult.design.height}
                    </p>
                  )}
                  {aiResult.text && (
                    <textarea
                      aria-label="Generated writing"
                      value={aiResult.text}
                      onChange={(e) =>
                        setAIResult({ ...aiResult, text: e.target.value })
                      }
                    />
                  )}
                  <button className="full-button dark" onClick={applyAI}>
                    <Plus size={16} />
                    {aiResult.design ? "Add as a new page" : "Add to canvas"}
                  </button>
                  {aiResult.text && selected?.type === "text" && (
                    <button
                      className="full-button"
                      onClick={() => update({ text: aiResult.text })}
                    >
                      Replace selected text
                    </button>
                  )}
                  {aiResult.image && selected?.type === "image" && (
                    <button
                      className="full-button"
                      onClick={() =>
                        void engine.current?.replaceSelectedImage(
                          aiResult.image!,
                        )
                      }
                    >
                      Replace selected image
                    </button>
                  )}
                </div>
              )}
              <button
                className="key-status"
                onClick={() => setModal("settings")}
              >
                <span
                  className={
                    settings.hasKey ? "connected-dot" : "disconnected-dot"
                  }
                />
                <span>
                  {settings.hasKey
                    ? "Gemini key saved"
                    : "Connect your Gemini key"}
                </span>
                <ArrowUpRight size={14} />
              </button>
              <p className="privacy-copy">
                Only AI prompts and images you choose to edit are sent to
                Google. API usage is billed to your Gemini account.
              </p>
            </>
          )}
          {panel === "brand" && (
            <>
              <div className="brand-card">
                <span className="brand-monogram">V.</span>
                <div>
                  <strong>Your brand, at home.</strong>
                  <p>Keep a palette and type choices close.</p>
                </div>
              </div>
              <div className="section-label">Brand colours</div>
              <div className="brand-swatches">
                {brand.colors.map((c, i) => (
                  <button
                    key={i}
                    className="brand-color"
                    style={{ background: c }}
                    onClick={() =>
                      selected
                        ? update({ fill: c })
                        : engine.current?.setBackground(c)
                    }
                    title={c}
                  />
                ))}
                <label className="add-color">
                  <Plus size={20} />
                  <input
                    type="color"
                    aria-label="Add brand colour"
                    onChange={(e) =>
                      engine.current?.setBrand(
                        [...brand.colors, e.target.value],
                        brand.fonts,
                      )
                    }
                  />
                </label>
              </div>
              <p className="small-hint">
                Select an element to apply. Otherwise, set the page colour.
              </p>
              <div className="section-label">Your typography</div>
              {brand.fonts.map((font) => (
                <button
                  className="brand-font"
                  key={font}
                  style={{ fontFamily: font }}
                  onClick={() => update({ fontFamily: font })}
                >
                  <span>{font}</span>
                  <span>Aa</span>
                </button>
              ))}
              <label className="field-label">
                Add a font
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value && !brand.fonts.includes(e.target.value))
                      engine.current?.setBrand(brand.colors, [
                        ...brand.fonts,
                        e.target.value,
                      ]);
                  }}
                >
                  <option value="">Choose a system font</option>
                  {FONTS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <div className="help-card">
                <Palette size={20} />
                <p>
                  Use these colours throughout your design for a consistent
                  look. Brand choices are saved with each project.
                </p>
              </div>
            </>
          )}
          {panel === "draw" && (
            <>
              <div className="draw-preview">
                <Pencil size={34} />
                <span>A little human touch.</span>
              </div>
              <button
                className={`full-button ${drawing ? "coral" : "dark"}`}
                onClick={() => {
                  setDrawing(!drawing);
                  engine.current?.setDrawing(!drawing, drawColor, drawWidth);
                }}
              >
                <Paintbrush size={17} />
                {drawing ? "Finish drawing" : "Start drawing"}
              </button>
              <div className="section-label">Ink colour</div>
              <div className="swatches">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    aria-label={`Draw in ${c}`}
                    style={{ background: c }}
                    className={drawColor === c ? "current" : ""}
                    onClick={() => {
                      setDrawColor(c);
                      engine.current?.setDrawing(drawing, c, drawWidth);
                    }}
                  />
                ))}
                <input
                  aria-label="Custom ink colour"
                  type="color"
                  value={drawColor}
                  onChange={(e) => {
                    setDrawColor(e.target.value);
                    engine.current?.setDrawing(
                      drawing,
                      e.target.value,
                      drawWidth,
                    );
                  }}
                />
              </div>
              <label className="range-label">
                Brush size<span>{drawWidth}px</span>
                <input
                  type="range"
                  min="1"
                  max="80"
                  value={drawWidth}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setDrawWidth(v);
                    engine.current?.setDrawing(drawing, drawColor, v);
                  }}
                />
              </label>
              <div className="help-card">
                <Paintbrush size={19} />
                <p>
                  Draw directly on your canvas. Every stroke stays editable as
                  its own layer.
                </p>
              </div>
            </>
          )}
        </aside>
        <main className="canvas-workspace">
          <div className="canvas-toolbar">
            <div className="toolbar-left">
              <IconButton
                title="Undo (⌘Z)"
                disabled={!state.canUndo}
                onClick={() => engine.current?.undo()}
              >
                <Undo2 size={17} />
              </IconButton>
              <IconButton
                title="Redo (⌘⇧Z)"
                disabled={!state.canRedo}
                onClick={() => engine.current?.redo()}
              >
                <Redo2 size={17} />
              </IconButton>
              <span className="toolbar-divider" />
              <button
                className="canvas-size"
                onClick={() => {
                  setSize({ w: state.width, h: state.height });
                  setModal("resize");
                }}
              >
                {state.width} × {state.height}
                <ChevronDown size={12} />
              </button>
            </div>
            <div className="toolbar-right">
              {selected && (
                <>
                  <IconButton
                    title="Duplicate selected (⌘D)"
                    onClick={() => engine.current?.duplicate()}
                  >
                    <Copy size={16} />
                  </IconButton>
                  <IconButton
                    title="Delete selected"
                    onClick={() => engine.current?.remove()}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                  <span className="toolbar-divider" />
                </>
              )}
              <span className="workspace-label">
                <span />
                LOCAL STUDIO
              </span>
            </div>
          </div>
          <div
            className="canvas-viewport"
            ref={viewportRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void uploadFiles(e.dataTransfer.files);
            }}
          >
            <canvas ref={canvasRef} />
            {!ready && (
              <div className="canvas-loading">
                <LoaderCircle className="spin" size={23} />
                <span>Opening your creative space…</span>
              </div>
            )}
          </div>
          <div className="page-strip">
            <div className="page-tabs">
              {state.pages.map((p, i) => (
                <button
                  key={p.id}
                  className={state.activePageId === p.id ? "active" : ""}
                  onClick={() => void engine.current?.setPage(p.id)}
                >
                  <span
                    className="page-mini"
                    style={{ background: state.background }}
                  />
                  {i + 1}
                  <span>{p.name}</span>
                </button>
              ))}
              <IconButton
                title="Add page"
                onClick={() => engine.current?.addPage()}
              >
                <Plus size={17} />
              </IconButton>
            </div>
            <div className="page-actions">
              <IconButton
                title="Duplicate page"
                onClick={() => engine.current?.duplicatePage()}
              >
                <Copy size={15} />
              </IconButton>
              <IconButton
                title="Delete page"
                disabled={state.pages.length < 2}
                onClick={() => engine.current?.deletePage()}
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
          </div>
          <footer className="canvas-footer">
            <span>
              {state.pages.length} {state.pages.length === 1 ? "page" : "pages"}
              <span className="footer-dot">·</span>
              {selected
                ? "Element selected"
                : "Click an element to make it yours"}
            </span>
            <div className="zoom-controls">
              <IconButton
                title="Zoom out"
                onClick={() =>
                  engine.current?.setZoom(Math.max(0.1, state.zoom - 0.1))
                }
              >
                <Minus size={14} />
              </IconButton>
              <input
                aria-label="Canvas zoom"
                type="range"
                min="10"
                max="150"
                value={Math.round(state.zoom * 100)}
                onChange={(e) =>
                  engine.current?.setZoom(Number(e.target.value) / 100)
                }
              />
              <button
                className="zoom-label"
                onClick={() => engine.current?.fit()}
              >
                {Math.round(state.zoom * 100)}%
              </button>
              <IconButton
                title="Zoom in"
                onClick={() =>
                  engine.current?.setZoom(Math.min(2, state.zoom + 0.1))
                }
              >
                <Plus size={14} />
              </IconButton>
              <IconButton
                title="Fit canvas"
                onClick={() => engine.current?.fit()}
              >
                <Maximize2 size={15} />
              </IconButton>
            </div>
          </footer>
        </main>
        <aside className="inspector">
          <div className="inspector-heading">
            <SlidersHorizontal size={17} />
            <h3>{selected ? "Make it just right." : "The details matter."}</h3>
          </div>
          <div className="inspector-scroll">
            {selected ? (
              <>
                <div className="selected-label">
                  <span>
                    {selected.type === "image"
                      ? "Image"
                      : selected.type === "text"
                        ? "Text"
                        : selected.type === "group"
                          ? "Group"
                          : "Element"}
                  </span>
                  <span className="pill">EDITABLE</span>
                </div>
                {selected.type === "text" && (
                  <>
                    <label className="field-label">
                      Your words
                      <textarea
                        aria-label="Selected text"
                        rows={3}
                        value={selected.text || ""}
                        onChange={(e) => update({ text: e.target.value })}
                      />
                    </label>
                    <label className="field-label">
                      Typeface
                      <select
                        aria-label="Typeface"
                        value={selected.fontFamily || "Arial"}
                        onChange={(e) => update({ fontFamily: e.target.value })}
                      >
                        {FONTS.map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </label>
                    <div className="field-row">
                      <NumberField
                        label="Size"
                        value={selected.fontSize || 24}
                        min={1}
                        max={1000}
                        onChange={(v) => update({ fontSize: v })}
                      />
                      <label className="field-label compact">
                        Weight
                        <select
                          aria-label="Font weight"
                          value={String(selected.fontWeight || "normal")}
                          onChange={(e) =>
                            update({ fontWeight: e.target.value })
                          }
                        >
                          <option value="normal">Regular</option>
                          <option value="bold">Bold</option>
                        </select>
                      </label>
                    </div>
                    <div className="segmented align-segment">
                      <button
                        title="Align text left"
                        className={selected.align === "left" ? "active" : ""}
                        onClick={() => update({ align: "left" })}
                      >
                        <AlignLeft size={16} />
                      </button>
                      <button
                        title="Align text center"
                        className={selected.align === "center" ? "active" : ""}
                        onClick={() => update({ align: "center" })}
                      >
                        <AlignCenter size={16} />
                      </button>
                      <button
                        title="Align text right"
                        className={selected.align === "right" ? "active" : ""}
                        onClick={() => update({ align: "right" })}
                      >
                        <AlignRight size={16} />
                      </button>
                    </div>
                  </>
                )}
                {selected.type !== "image" && (
                  <>
                    <div className="field-label">
                      Colour
                      <label className="color-field">
                        <input
                          aria-label="Element colour"
                          type="color"
                          value={
                            typeof selected.fill === "string" &&
                            /^#[0-9a-f]{6}$/i.test(selected.fill)
                              ? selected.fill
                              : "#252922"
                          }
                          onChange={(e) => update({ fill: e.target.value })}
                        />
                        <input
                          aria-label="Hex colour"
                          value={
                            typeof selected.fill === "string"
                              ? selected.fill
                              : "#252922"
                          }
                          onChange={(e) => update({ fill: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="swatches inspector-swatches">
                      {brand.colors.map((c) => (
                        <button
                          key={c}
                          style={{ background: c }}
                          title={c}
                          onClick={() => update({ fill: c })}
                        />
                      ))}
                    </div>
                  </>
                )}
                {selected.type === "image" && (
                  <>
                    <button
                      className="full-button coral remove-bg"
                      onClick={removeBackground}
                      disabled={!!busy}
                    >
                      <WandSparkles size={16} />
                      Remove background
                    </button>
                    <span className="local-tool-label">
                      <Lock size={11} />
                      LOCAL · NO CREDITS
                    </span>
                    <button
                      className="full-button"
                      onClick={() => {
                        choosePanel("ai");
                        setAiKind("edit");
                        setPrompt("");
                      }}
                    >
                      <Sparkles size={15} />
                      Edit with Gemini
                    </button>
                    <div className="section-label">Adjust image</div>
                    {(["brightness", "contrast", "saturation"] as const).map(
                      (effect) => (
                        <label className="range-label" key={effect}>
                          {effect[0].toUpperCase() + effect.slice(1)}
                          <input
                            aria-label={effect}
                            type="range"
                            min="-1"
                            max="1"
                            step="0.02"
                            defaultValue="0"
                            onChange={(e) =>
                              engine.current?.applyEffects({
                                [effect]: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                      ),
                    )}
                    <label className="field-label">
                      Crop to shape
                      <select
                        aria-label="Crop image ratio"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value)
                            engine.current?.cropImage(Number(e.target.value));
                        }}
                      >
                        <option value="">Choose a ratio</option>
                        <option value="1">Square · 1:1</option>
                        <option value="1.7777777778">Landscape · 16:9</option>
                        <option value="0.75">Portrait · 3:4</option>
                      </select>
                    </label>
                  </>
                )}
                <div className="section-label">Position & size</div>
                <div className="field-row">
                  <NumberField
                    label="X"
                    value={selected.left || 0}
                    onChange={(v) => update({ left: v })}
                  />
                  <NumberField
                    label="Y"
                    value={selected.top || 0}
                    onChange={(v) => update({ top: v })}
                  />
                </div>
                <div className="field-row">
                  <NumberField
                    label="W"
                    value={selected.width || 1}
                    min={1}
                    onChange={(v) => update({ width: v })}
                  />
                  <NumberField
                    label="H"
                    value={selected.height || 1}
                    min={1}
                    onChange={(v) => update({ height: v })}
                  />
                </div>
                <div className="field-row">
                  <NumberField
                    label="Rotation"
                    value={selected.angle || 0}
                    onChange={(v) => update({ angle: v })}
                  />
                  <NumberField
                    label="Opacity %"
                    value={(selected.opacity ?? 1) * 100}
                    min={0}
                    max={100}
                    onChange={(v) =>
                      update({ opacity: Math.min(1, Math.max(0, v / 100)) })
                    }
                  />
                </div>
                <div className="alignment-grid">
                  {(
                    [
                      "left",
                      "center",
                      "right",
                      "top",
                      "middle",
                      "bottom",
                    ] as const
                  ).map((a) => (
                    <button
                      key={a}
                      title={`Align to page ${a}`}
                      onClick={() => engine.current?.align(a)}
                    >
                      {a === "left"
                        ? "⇤"
                        : a === "center"
                          ? "↔"
                          : a === "right"
                            ? "⇥"
                            : a === "top"
                              ? "↥"
                              : a === "middle"
                                ? "↕"
                                : "↧"}
                    </button>
                  ))}
                </div>
                <div className="section-label">Arrange</div>
                <div className="action-grid">
                  <button onClick={() => engine.current?.arrange("up")}>
                    <ArrowUp size={15} />
                    Forward
                  </button>
                  <button onClick={() => engine.current?.arrange("down")}>
                    <ArrowDown size={15} />
                    Backward
                  </button>
                  <button onClick={() => engine.current?.flip("x")}>
                    <FlipHorizontal size={15} />
                    Flip H
                  </button>
                  <button onClick={() => engine.current?.flip("y")}>
                    <FlipVertical size={15} />
                    Flip V
                  </button>
                  <button onClick={() => engine.current?.group()}>
                    <Group size={15} />
                    Group
                  </button>
                  <button onClick={() => engine.current?.ungroup()}>
                    <Ungroup size={15} />
                    Ungroup
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="page-details">
                  <span className="page-detail-icon">
                    <Square size={25} />
                  </span>
                  <h4>A canvas of possibility.</h4>
                  <p>
                    Click any element to adjust its colour, type, position, and
                    more.
                  </p>
                </div>
                <div className="field-label">
                  Canvas colour
                  <label className="color-field">
                    <input
                      type="color"
                      aria-label="Canvas background"
                      value={
                        /^#[0-9a-f]{6}$/i.test(state.background)
                          ? state.background
                          : "#f6f2e9"
                      }
                      onChange={(e) =>
                        engine.current?.setBackground(e.target.value)
                      }
                    />
                    <input
                      aria-label="Canvas background hex"
                      value={state.background}
                      onChange={(e) =>
                        engine.current?.setBackground(e.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="swatches inspector-swatches">
                  {COLORS.slice(0, 7).map((c) => (
                    <button
                      key={c}
                      style={{ background: c }}
                      title={c}
                      onClick={() => engine.current?.setBackground(c)}
                    />
                  ))}
                </div>
                <button
                  className="full-button"
                  onClick={() => {
                    setSize({ w: state.width, h: state.height });
                    setModal("resize");
                  }}
                >
                  <Maximize2 size={15} />
                  Resize canvas
                </button>
              </>
            )}
            <div className="layer-heading">
              <div>
                <Layers size={16} />
                <span>Layers</span>
              </div>
              <span>{state.layers.length}</span>
            </div>
            <div className="layer-list">
              {state.layers.map((layer) => (
                <div
                  key={layer.id}
                  className={`layer-row ${selected?.id === layer.id ? "active" : ""}`}
                >
                  <button
                    className="layer-select"
                    onClick={() => engine.current?.selectLayer(layer.id)}
                  >
                    <span className="layer-icon">
                      {layer.type === "text" ? (
                        <Type size={13} />
                      ) : layer.type === "image" ? (
                        <ImageIcon size={13} />
                      ) : (
                        <Square size={13} />
                      )}
                    </span>
                    <span>{layer.name}</span>
                  </button>
                  <button
                    title={layer.visible ? "Hide layer" : "Show layer"}
                    onClick={() =>
                      engine.current?.setLayerVisibility(
                        layer.id,
                        !layer.visible,
                      )
                    }
                  >
                    {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    title={layer.locked ? "Unlock layer" : "Lock layer"}
                    onClick={() =>
                      engine.current?.setLayerLocked(layer.id, !layer.locked)
                    }
                  >
                    {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="inspector-tip">
            <span>✦</span>
            <p>
              A little less, a little better.
              <br />
              Give your ideas room to breathe.
            </p>
          </div>
        </aside>
      </div>
      <input
        ref={uploadRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          void uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={projectRef}
        type="file"
        accept=".visro,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            void work("Opening your project", async () => {
              const project = JSON.parse(await file.text());
              await engine.current!.loadProject(project);
              setName(project.name || "Untitled design");
              activeId.current = crypto.randomUUID();
            });
          e.target.value = "";
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          <span>{toast}</span>
          <button aria-label="Dismiss message" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {busy && (
        <div className="busy-toast" role="status">
          <LoaderCircle className="spin" size={19} />
          <div>
            <strong>{busy}</strong>
            {busyPercent > 0 && (
              <>
                <div className="progress-track">
                  <span style={{ width: `${busyPercent}%` }} />
                </div>
                <span>{Math.round(busyPercent)}%</span>
              </>
            )}
          </div>
        </div>
      )}
      {modal && (
        <div
          className={`modal-backdrop ${modal === "present" ? "present-backdrop" : ""}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className={`modal modal-${modal}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "settings"
                ? "Gemini settings"
                : modal === "export"
                  ? "Export design"
                  : modal === "resize"
                    ? "Canvas size"
                    : modal === "library"
                      ? "Your projects"
                      : "Presentation"
            }
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "settings" && (
              <>
                <span className="modal-symbol">
                  <Sparkles size={26} />
                </span>
                <span className="eyebrow">BRING YOUR OWN MAGIC</span>
                <h2>One key. So many possibilities.</h2>
                <p className="modal-intro">
                  Connect Gemini for editable designs, fresh imagery, photo
                  edits, and better words.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSettingsError("");
                    void work("Connecting Gemini", async () => {
                      if (!desktop) {
                        setSettingsError(
                          "API keys are connected in the installed Visro Mac app.",
                        );
                        return;
                      }
                      try {
                        const s = await desktop.saveSettings({
                          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
                          textModel,
                          imageModel,
                        });
                        setSettings(s);
                        setApiKey("");
                        notify(
                          s.hasKey
                            ? "Gemini key securely saved."
                            : "Model settings saved.",
                        );
                        setModal(null);
                      } catch (e) {
                        setSettingsError(
                          e instanceof Error
                            ? e.message
                            : "Could not save settings.",
                        );
                      }
                    });
                  }}
                >
                  <label className="field-label">
                    Gemini API key
                    <input
                      aria-label="Gemini API key"
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={
                        settings.hasKey
                          ? "Key saved securely · paste to replace"
                          : "Paste your key from Google AI Studio"
                      }
                    />
                  </label>
                  <div className="settings-security">
                    <Lock size={14} />
                    <span>
                      {desktop
                        ? "Encrypted on this Mac. Your key never enters the canvas or a project file."
                        : "Connect your key in the Mac app. Background removal works without one."}
                    </span>
                  </div>
                  <div className="field-row">
                    <label className="field-label">
                      Text & design model
                      <input
                        aria-label="Text model"
                        list="gemini-models"
                        value={textModel}
                        onChange={(e) => setTextModel(e.target.value)}
                      />
                    </label>
                    <label className="field-label">
                      Image model
                      <input
                        aria-label="Image model"
                        list="gemini-models"
                        value={imageModel}
                        onChange={(e) => setImageModel(e.target.value)}
                      />
                    </label>
                  </div>
                  <datalist id="gemini-models">
                    {models.map((m) => (
                      <option
                        key={m.name}
                        value={m.name.replace(/^models\//, "")}
                      >
                        {m.displayName}
                      </option>
                    ))}
                  </datalist>
                  <div className="settings-links">
                    <button
                      type="button"
                      onClick={() =>
                        desktop
                          ? void desktop.openExternal(
                              "https://aistudio.google.com/apikey",
                            )
                          : window.open(
                              "https://aistudio.google.com/apikey",
                              "_blank",
                              "noopener",
                            )
                      }
                    >
                      <ExternalLink size={13} />
                      Get a Gemini key
                    </button>
                    {settings.hasKey && desktop && (
                      <button
                        type="button"
                        onClick={() =>
                          void work("Checking available models", async () => {
                            const available = await desktop!.listModels();
                            setModels(available);
                            notify(
                              `${available.length} models loaded. Choose one in the model fields.`,
                            );
                          })
                        }
                      >
                        <Search size={13} />
                        Load available models
                      </button>
                    )}
                  </div>
                  {settingsError && (
                    <p className="error-message">{settingsError}</p>
                  )}
                  <button
                    className="full-button coral"
                    type="submit"
                    disabled={!!busy}
                  >
                    <Lock size={16} />
                    {settings.hasKey ? "Save settings" : "Connect Gemini"}
                  </button>
                  {settings.hasKey && (
                    <button
                      type="button"
                      className="remove-key"
                      onClick={() =>
                        void work("Removing Gemini key", async () => {
                          if (desktop) {
                            setSettings(
                              await desktop.saveSettings({ clearKey: true }),
                            );
                            setApiKey("");
                            notify("Gemini key removed from this Mac.");
                          }
                        })
                      }
                    >
                      Remove saved key
                    </button>
                  )}
                </form>
                <p className="privacy-copy">
                  Gemini availability and pricing depend on your Google account
                  and chosen model. Background removal runs locally.
                </p>
              </>
            )}
            {modal === "export" && (
              <>
                <span className="modal-symbol">
                  <Download size={25} />
                </span>
                <span className="eyebrow">READY FOR THE WORLD</span>
                <h2>Take your idea with you.</h2>
                <p className="modal-intro">
                  A beautiful file, ready to share wherever you like.
                </p>
                <label className="field-label">
                  File type
                  <select
                    aria-label="Export format"
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value)}
                  >
                    <option value="png">
                      PNG · Crisp images & transparency
                    </option>
                    <option value="jpeg">JPG · Smaller, ready to share</option>
                    <option value="svg">SVG · Editable vector graphics</option>
                    <option value="pdf">PDF · Every page, one document</option>
                  </select>
                </label>
                {exportFormat !== "pdf" && exportFormat !== "svg" && (
                  <label className="field-label">
                    Resolution
                    <select
                      aria-label="Export resolution"
                      value={exportScale}
                      onChange={(e) => setExportScale(Number(e.target.value))}
                    >
                      <option value="1">
                        1× · {state.width} × {state.height}
                      </option>
                      <option value="2">
                        2× · {state.width * 2} × {state.height * 2}
                      </option>
                      <option value="3">
                        3× · {state.width * 3} × {state.height * 3}
                      </option>
                    </select>
                  </label>
                )}
                {exportFormat === "png" && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={transparent}
                      onChange={(e) => setTransparent(e.target.checked)}
                    />
                    <span>Transparent background</span>
                  </label>
                )}
                <div className="export-detail">
                  <Layers size={17} />
                  <span>
                    {exportFormat === "pdf"
                      ? `All ${state.pages.length} pages`
                      : "Current page"}
                    <strong>{name}</strong>
                  </span>
                </div>
                <button
                  className="full-button coral"
                  onClick={exportDesign}
                  disabled={!!busy}
                >
                  <Download size={16} />
                  Export{" "}
                  {exportFormat === "jpeg" ? "JPG" : exportFormat.toUpperCase()}
                </button>
                <button className="full-button" onClick={() => void save()}>
                  <Save size={16} />
                  Save editable .visro project
                </button>
              </>
            )}
            {modal === "resize" && (
              <>
                <span className="modal-symbol">
                  <Maximize2 size={24} />
                </span>
                <span className="eyebrow">ROOM FOR YOUR IDEAS</span>
                <h2>Find your perfect canvas.</h2>
                <div className="preset-grid">
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      className={
                        size.w === p.w && size.h === p.h ? "active" : ""
                      }
                      onClick={() => setSize({ w: p.w, h: p.h })}
                    >
                      <span>{p.name}</span>
                      <small>
                        {p.w} × {p.h}
                      </small>
                    </button>
                  ))}
                </div>
                <div className="field-row">
                  <NumberField
                    label="Width (px)"
                    value={size.w}
                    min={100}
                    max={8000}
                    onChange={(w) => setSize((s) => ({ ...s, w }))}
                  />
                  <NumberField
                    label="Height (px)"
                    value={size.h}
                    min={100}
                    max={8000}
                    onChange={(h) => setSize((s) => ({ ...s, h }))}
                  />
                </div>
                <button
                  className="full-button coral"
                  onClick={() => {
                    if (
                      size.w < 100 ||
                      size.h < 100 ||
                      size.w > 8000 ||
                      size.h > 8000
                    ) {
                      notify("Choose dimensions from 100 to 8000 pixels.");
                      return;
                    }
                    engine.current?.resizeDesign(size.w, size.h);
                    setModal(null);
                  }}
                >
                  <Maximize2 size={16} />
                  Resize current design
                </button>
                <button
                  className="full-button"
                  onClick={() =>
                    void work("Adding your page", async () => {
                      await engine.current?.addPage();
                      engine.current?.resizeDesign(size.w, size.h);
                      setModal(null);
                    })
                  }
                >
                  Add a blank page at this size
                </button>
              </>
            )}
            {modal === "library" && (
              <>
                <span className="eyebrow">MADE BY YOU</span>
                <h2>Your ideas live here.</h2>
                <p className="modal-intro">
                  Saved on this Mac, ready whenever inspiration comes.
                </p>
                <div className="library-actions">
                  <button
                    className="primary-button"
                    onClick={() => {
                      void newDesign();
                      setModal(null);
                    }}
                  >
                    <Plus size={16} />
                    New design
                  </button>
                  <button className="quiet-button" onClick={() => void open()}>
                    <FolderOpen size={16} />
                    Open project file
                  </button>
                </div>
                <div className="library-grid">
                  {library.map((d, i) => (
                    <div className="library-card" key={d.id}>
                      <button
                        onClick={() =>
                          void work("Opening your design", async () => {
                            await engine.current!.loadProject(
                              d.project as Parameters<
                                StudioEditor["loadProject"]
                              >[0],
                            );
                            setName(d.name);
                            activeId.current = d.id;
                            setModal(null);
                          })
                        }
                      >
                        <div
                          className="library-cover"
                          style={{ background: COLORS[i % COLORS.length] }}
                        >
                          <span>{d.name}</span>
                          <ArrowUpRight size={22} />
                        </div>
                        <strong>{d.name}</strong>
                        <small>
                          {new Date(d.updated).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          · Saved locally
                        </small>
                      </button>
                      <IconButton
                        title={`Delete saved project ${d.name}`}
                        onClick={() =>
                          void work("Removing saved project", async () => {
                            await deleteDesign(d.id);
                            setLibrary(await listDesigns());
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  ))}
                </div>
                {library.length === 0 && (
                  <div className="empty-library">
                    <Sparkles size={25} />
                    <p>Your first idea is just a canvas away.</p>
                  </div>
                )}
              </>
            )}
            {modal === "present" && (
              <>
                <img
                  src={presentImage}
                  alt={`Presentation page ${presentIndex + 1}`}
                />
                <div className="presentation-controls">
                  <IconButton
                    title="Previous page"
                    disabled={presentIndex === 0}
                    onClick={() => void movePresent(-1)}
                  >
                    <ChevronLeft size={23} />
                  </IconButton>
                  <span>
                    {presentIndex + 1} / {state.pages.length}
                  </span>
                  <IconButton
                    title="Next page"
                    disabled={presentIndex === state.pages.length - 1}
                    onClick={() => void movePresent(1)}
                  >
                    <ChevronRight size={23} />
                  </IconButton>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
