import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  lazy,
  Suspense,
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
  Home as HomeIcon, Moon, Sun, Bold, Italic, Underline, MessageCircle, Video, FileText, Grid3X3, Globe, Clock, MoreHorizontal,
} from "lucide-react";
import { StudioEditor } from "./editor";
import { Home } from "./Home";
import {PublicImageLibrary} from './PublicImageLibrary';
import {GraphicsLibrary} from './GraphicsLibrary';
import {EditingModeMenu,type EditingMode} from './EditingModeMenu';
import {installEditorAccess,type EditorAccess} from './editor-access';
import './editor-layout.css';
import {FrameLibrary} from './FrameLibrary';
import {TEXT_FONT_WEIGHTS} from './text-formatting';
import {TextFormatting} from './TextFormatting';
import {ContinuousPages} from './ContinuousPages';
import {ShapeLibrary} from './ShapeLibrary';
import {getPublicImage as fetchPublicImage} from './public-images';
import { TemplateBrowser } from "./TemplateBrowser";
import { QuickActions, type QuickAction } from "./QuickActions";
import {normalizeWorkspaceTabs,upsertWorkspaceTab,type WorkspaceTab} from './workspace-tabs';
import {PositionPanel} from "./PositionPanel";
import {StrokeStyle,CornerRounding} from './StrokeStyle';
import {LineEditing} from './LineEditing';
import {ShapeEffects} from './ShapeEffects';
import {ImageControls} from "./ImageControls";
import {ElementMenu,type ElementAction} from "./ElementMenu";
import {CanvasGuides} from "./CanvasGuides";
import BrandKitsPanel from "./BrandKitsPanel";
import {StudioIcon,TemplatesIcon,ElementsIcon,TextIcon,BrandIcon,UploadsIcon,ToolsIcon,ProjectsIcon,AppsIcon,ComponentsIcon,AudioIcon,BackgroundIcon,ChartsIcon} from "./icons";
const MagicMediaPanel=lazy(()=>import("./MagicMediaPanel"));
import {TemplatePreview} from "./TemplatePreview";
import { ToolsPanel, type ToolTab } from "./ToolsPanel";
import { DocumentEditor, SheetEditor, sanitizeDocument } from "./DocumentSuite";
import { MediaStudio } from "./MediaStudio";
import ImageCropEditor from "./ImageCropEditor";
import ImageMaskEditor from "./ImageMaskEditor";
import {importPDF,exportPowerPoint} from "./file-formats";
import {packProject,unpackProject} from "./portable";
import {parseCSV} from "./spreadsheet";
import {FONT_FAMILIES,loadDesignFonts} from "./font-catalog";
import {pageLinks,escapeHTML} from "./links";
import { getThemePreference, setThemePreference, watchSystemTheme, type ThemePreference } from "./ui-theme";
import { TEMPLATES } from "./templates";
import { createProject } from "./project";
import type { EditorState, SelectionState } from "./editor-types";
import { removeImageBackground } from "./background";
import {
  desktop,
  DEFAULT_SETTINGS,
  saveExport,
  saveProjectFallback,
  type Settings, type PublicImage, type PublicImageResult,
} from "./bridge";
import {
  listDesigns, getDesign, listDesignSummaries,
  storeDesign,
  deleteDesign, listAssets, storeAsset, storeVersion,
  type SavedDesign,
} from "./storage";

type Panel =
  "templates" | "elements" | "text" | "uploads" | "ai" | "brand" | "draw" | "tools" | "video" | "documents" | "sheets" | "projects" | "apps" | "components" | "audio" | "background" | "charts" | "image" | "color" | "font" | "shape-edit" | "shape-effects";
type AIKind = "design" | "image" | "edit" | "copy" | "translate" | "rewrite" | "summarize" | "remix" | "resize" | "voice" | "video";
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
  "Canva Sans",
  ...FONT_FAMILIES,
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

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    viewportRef = useRef<HTMLDivElement>(null),
    engine = useRef<StudioEditor | null>(null),
    uploadRef = useRef<HTMLInputElement>(null),
    projectRef = useRef<HTMLInputElement>(null), fontRef = useRef<HTMLInputElement>(null);
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
  const [home, setHome] = useState(true), [homeRefresh, setHomeRefresh] = useState(0),
    [inspectorOpen, setInspectorOpen] = useState(false), [toolTab, setToolTab] = useState<ToolTab>("graphics"),
    [theme, setTheme] = useState<ThemePreference>(getThemePreference()),
    [dark, setDark] = useState(document.documentElement.dataset.theme === "dark"),
    [mode, setMode] = useState<"design"|"document"|"sheet"|"video">("design"),
    [customFonts, setCustomFonts] = useState<string[]>([]),
    [fileMenu, setFileMenu] = useState(false), [presentAuto, setPresentAuto] = useState(false);
  const [elementsTab,setElementsTab]=useState<'all'|'shapes'|'graphics'|'photos'|'frames'|'grids'>('all'),[publicImagePreviewOpen,setPublicImagePreviewOpen]=useState(false);
  const photoSources=useRef(new Map<string,NonNullable<import('./editor-types').ElementMetadata['source']>>());
  const [maskSources,setMaskSources]=useState<{original:string;current:string}|null>(null);
  const [quickActionsOpen,setQuickActionsOpen]=useState(false);
  const workspaceActionRef=useRef<(action:string)=>void>(()=>{});
  const [workspaceTabs,setWorkspaceTabsState]=useState<WorkspaceTab[]>(()=>{try{return normalizeWorkspaceTabs(JSON.parse(localStorage.getItem('visro-workspace-tabs')||'[]'));}catch{return [];}});
  const workspaceTabsRef=useRef(workspaceTabs);
  const setWorkspaceTabs=useCallback((update:WorkspaceTab[]|((tabs:WorkspaceTab[])=>WorkspaceTab[]))=>{const next=typeof update==='function'?update(workspaceTabsRef.current):update;workspaceTabsRef.current=next;setWorkspaceTabsState(next);},[]);
  const [initialClosedTabs]=useState<WorkspaceTab[]>(()=>{try{return normalizeWorkspaceTabs(JSON.parse(localStorage.getItem('visro-closed-tabs')||'[]')).slice(0,10);}catch{return [];}});
  const closedTabs=useRef<WorkspaceTab[]>(initialClosedTabs),closedTabIds=useRef(new Set(initialClosedTabs.map(t=>t.id))),closingTabIds=useRef(new Set<string>());
  const forgetClosedTab=useCallback((id:string)=>{closedTabIds.current.delete(id);closedTabs.current=closedTabs.current.filter(t=>t.id!==id);localStorage.setItem('visro-closed-tabs',JSON.stringify(closedTabs.current));},[]);
  const [panelOpen,setPanelOpen]=useState(false),[commentsOpen,setCommentsOpen]=useState(false),[notesOpen,setNotesOpen]=useState(false),[pagesOpen,setPagesOpen]=useState(true),[gridView,setGridView]=useState(false),[mediaEpoch,setMediaEpoch]=useState(0),[pageThumbnails,setPageThumbnails]=useState<Record<string,string>>({});
  const [contextMenu,setContextMenu]=useState<{x:number;y:number}|null>(null),[elementDialog,setElementDialog]=useState<{kind:'link'|'alt'|'component';value:string}|null>(null),[components,setComponents]=useState<Awaited<ReturnType<typeof listAssets>>>([]);
  const getEditor=useCallback(()=>engine.current,[]);
  const closeContext=useCallback(()=>setContextMenu(null),[]);
  const interactionRef=useRef(false),replaceImageRef=useRef<string|null>(null);
  const accessRef=useRef<EditorAccess|null>(null);
  const [editingMode,setEditingMode]=useState<EditingMode>('editing');
  const pageNavigator=useRef<((id:string)=>Promise<void>)|null>(null);
  const [visiblePageIndex,setVisiblePageIndex]=useState(0),[textMenuOpen,setTextMenuOpen]=useState(false),[replaceTarget,setReplaceTarget]=useState<{id:string;pageId:string}|null>(null);
  const stylePaintRef=useRef(false),browserClipboardRef=useRef<Record<string,unknown>[]>([]);
  useEffect(()=>{const input=uploadRef.current;if(!input)return;const cancel=()=>{replaceImageRef.current=null;};input.addEventListener('cancel',cancel);return()=>input.removeEventListener('cancel',cancel);},[]);
  const [positionTab,setPositionTab]=useState<"arrange"|"layers">("arrange"),[colorHex,setColorHex]=useState("#000000"),[graphicColorTarget,setGraphicColorTarget]=useState<string|null>(null);
  const [colourTarget,setColourTarget]=useState<'fill'|'stroke'|'effect'|'effect2'>('fill');
  useEffect(()=>{setGraphicColorTarget(null);setColourTarget('fill');},[selected?.id]);
  useEffect(()=>{if(replaceTarget&&(replaceTarget.pageId!==state.activePageId||selected?.id!==replaceTarget.id))setReplaceTarget(null);},[replaceTarget,state.activePageId,selected?.id]);
  const [toolbarPopover,setToolbarPopover]=useState<"spacing"|"transparency"|"flip"|null>(null),[timerOpen,setTimerOpen]=useState(false),[timerSeconds,setTimerSeconds]=useState(0),[timerRunning,setTimerRunning]=useState(false);
  const [cropSource,setCropSource]=useState<ReturnType<StudioEditor["getImageCropSource"]>>(null);
  const [viewSettings,setViewSettings]=useState(()=>{try{const value=JSON.parse(localStorage.getItem('visro-view-settings')||'{}');return value&&typeof value==='object'?value as {rulers?:boolean;margins?:boolean;snapping?:boolean;locked?:boolean}:{};}catch{return {};}});
  const [viewMenu,setViewMenu]=useState(false),[guidesDialog,setGuidesDialog]=useState(false),[guideGrid,setGuideGrid]=useState({columns:3,rows:0,gap:0,margin:0});
  const fileMenuRef=useRef<HTMLDivElement>(null);
  const openCrop=()=>{const source=engine.current?.getImageCropSource();if(source)setCropSource(source);else notify("Select a photo to crop.");};
  const contentRef = useRef<unknown>(undefined);
  const [apiKey, setApiKey] = useState(""),
    [textModel, setTextModel] = useState(DEFAULT_SETTINGS.textModel),
    [imageModel, setImageModel] = useState(DEFAULT_SETTINGS.imageModel),
    [voiceModel,setVoiceModel]=useState(DEFAULT_SETTINGS.voiceModel),[videoModel,setVideoModel]=useState(DEFAULT_SETTINGS.videoModel),
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
  const projectGeneration = useRef(0), switchingProject = useRef(false), initializedProject = useRef(false);
  const publishPagePreview=useCallback((id:string,data:string,projectKey:string)=>{
    if(projectKey!==activeId.current||switchingProject.current)return;
    setPageThumbnails(previous=>previous[id]===data?previous:{...previous,[id]:data});
  },[]);
  const projectSwitchQueue = useRef<Promise<unknown>>(Promise.resolve());
  const startupPreparation = useRef<Promise<void>>(Promise.resolve());
  const stableProject = useRef<{id:string;name:string;project:Parameters<StudioEditor['loadProject']>[0]}|null>(null);
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
  useEffect(()=>{if(ready&&!closedTabIds.current.has(activeId.current))setWorkspaceTabs(tabs=>{const previous=tabs.find(t=>t.id===activeId.current);return previous?.name===name?tabs:upsertWorkspaceTab(tabs,{id:activeId.current,name});});},[ready,name]);
  useEffect(()=>localStorage.setItem('visro-workspace-tabs',JSON.stringify(workspaceTabs)),[workspaceTabs]);
  useEffect(() => { setThemePreference(theme); setDark(document.documentElement.dataset.theme === "dark"); return watchSystemTheme(() => setDark(document.documentElement.dataset.theme === "dark")); }, [theme]);
  const toggleTheme = () => setTheme(dark ? "light" : "dark");
  useEffect(()=>{localStorage.setItem('visro-view-settings',JSON.stringify(viewSettings));engine.current?.setSnapping(Boolean(viewSettings.snapping));},[viewSettings,ready]);
  useEffect(()=>{
    const stop=()=>{interactionRef.current=false;viewportRef.current?.classList.remove('interacting');};
    window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);window.addEventListener('blur',stop);
    return()=>{window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);window.removeEventListener('blur',stop);};
  },[]);
  useEffect(()=>{if(!fileMenu){setViewMenu(false);return;}const outside=(e:PointerEvent)=>{if(!fileMenuRef.current?.contains(e.target as Node))setFileMenu(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[fileMenu]);
  const fontOptions = [...new Set([...FONTS,...customFonts])];
  useEffect(()=>setColorHex(selected?.fill||state.background),[selected?.id,selected?.fill,state.background]);
  const restoreMode = useCallback((project: {kind?: string; content?: unknown}) => {
    contentRef.current = project.content;
    setMode(project.kind === "document" ? "document" : project.kind === "sheet" ? "sheet" : project.kind === "video" ? "video" : "design");
  }, []);

  const switchProject = useCallback((prepare:()=>Promise<{id:string;name:string;project?:Parameters<StudioEditor['loadProject']>[0];load?:(studio:StudioEditor)=>Promise<void>;nativeFile?:boolean}>)=>{
    const studio=engine.current;
    if(!studio)return Promise.resolve(false);
    const generation=++projectGeneration.current;
    const savePrevious=initializedProject.current&&!switchingProject.current;
    const previousId=activeId.current,previousName=nameRef.current;
    switchingProject.current=true;setReady(false);
    const task=projectSwitchQueue.current.catch(()=>undefined).then(async()=>{
      try{
        if(engine.current!==studio)return false;
        if(savePrevious){
          // Finish any queued image/page operation before capturing the departing design.
          await studio.whenIdle();
          if(engine.current!==studio)return false;
          studio.flushPendingChanges();
          const project=studio.serialize(previousName);
          stableProject.current={id:previousId,name:previousName,project};
          await storeDesign({id:previousId,name:previousName,updated:Date.now(),project});
        }
        await startupPreparation.current;
        if(generation!==projectGeneration.current||engine.current!==studio)return false;
        const target=await prepare();
        if(generation!==projectGeneration.current||engine.current!==studio)return false;
        activeId.current=target.id;
        setPageThumbnails({});
        if(target.load)await target.load(studio);
        else if(target.project)await studio.loadProject(target.project);
        if(generation!==projectGeneration.current||engine.current!==studio)return false;
        const project=studio.serialize(target.name);
        stableProject.current={id:target.id,name:target.name,project};
        localStorage.setItem("visro-active-design",target.id);
        if(target.nativeFile)nativeSavedId.current=target.id;
        nameRef.current=target.name;setName(target.name);restoreMode(project);
        initializedProject.current=true;switchingProject.current=false;setReady(true);setHome(false);studio.fit();
        return true;
      }catch(error){
        if(generation===projectGeneration.current&&engine.current===studio){
          const previous=stableProject.current;
          if(previous)await studio.loadProject(previous.project);
          else await studio.loadTemplate(TEMPLATES[0].id);
          if(generation===projectGeneration.current&&engine.current===studio){
            const restored=previous??{id:previousId,name:TEMPLATES[0].name,project:studio.serialize(TEMPLATES[0].name)};
            stableProject.current=restored;activeId.current=restored.id;setPageThumbnails({});nameRef.current=restored.name;setName(restored.name);restoreMode(restored.project);
            initializedProject.current=true;switchingProject.current=false;setReady(true);
          }
        }
        throw error;
      }
    });
    projectSwitchQueue.current=task.catch(()=>undefined);
    return task;
  },[restoreMode]);

  const waitForStableStudio=useCallback(async()=>{
    let queue:Promise<unknown>,studio:StudioEditor|null;
    do{
      queue=projectSwitchQueue.current;
      await startupPreparation.current;
      await queue;
      studio=engine.current;
      if(!studio)throw new Error("The editor is no longer available.");
      await studio.whenIdle();
    }while(queue!==projectSwitchQueue.current||switchingProject.current||studio!==engine.current);
    if(!initializedProject.current)throw new Error("The design is still loading. Please try again.");
    return studio;
  },[]);

  useEffect(() => {
    if (!canvasRef.current || !viewportRef.current) return;
    initializedProject.current=false;setReady(false);
    let alive = true;
    const startupGeneration=projectGeneration.current,startupId=activeId.current;
    const studio = new StudioEditor(canvasRef.current, {
      onChange: (s) => {
        if (alive) {
          setState({ ...s });
          setBrand(s.brand);
          setDirty(s.dirty);
        }
      },
      onSelection: (s) => {
        if (alive){if(stylePaintRef.current&&s){stylePaintRef.current=false;studio.pasteStyle();return;}setSelected(s ? { ...s } : null);}
      },
    });
    engine.current = studio;
    accessRef.current=installEditorAccess(studio);
    const resize = () => {
      const node = viewportRef.current!;
      studio.resizeViewport(node.clientWidth, node.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewportRef.current,{box:'border-box'});
    const preparation=(async () => {
      try {
        const [current, assets, localTypeface] = await Promise.all([getDesign(startupId), listAssets(["font"]), desktop?.getLocalTypeface?.().catch(()=>null) ?? fetch("/local-typeface?v=2",{cache:"no-store"}).then(r=>r.ok?r.json():null).catch(()=>null),loadDesignFonts()]);
        if(localTypeface?.data){try{const font=new FontFace("Canva Sans",`url(${localTypeface.data})`,{weight:"400 700"});await font.load();document.fonts.add(font);}catch{ /* Use the system fallback when the local typeface is unavailable. */ }}
        if (!alive || engine.current !== studio) return;
        for (const asset of assets.filter(a => a.kind === "font")) {
          try { const font = new FontFace(asset.name, `url(${asset.data})`); await font.load(); document.fonts.add(font); } catch { /* An unavailable font can be replaced in the text toolbar. */ }
          if (!alive) return;
        }
        setCustomFonts(assets.filter(a => a.kind === "font").map(a => a.name));
        setUploads(assets.filter(a => a.kind === "image" || a.kind === "logo").map(a => a.data));
        if(current&&!stableProject.current)stableProject.current={id:startupId,name:current.name,project:current.project as Parameters<StudioEditor['loadProject']>[0]};
        const snapshot=stableProject.current;
        return snapshot?.id===startupId?{id:snapshot.id,name:snapshot.name,project:snapshot.project,updated:Date.now()}:current;
      } catch(e){notify(e instanceof Error?e.message:"Could not prepare the design library.");return undefined;}
    })();
    startupPreparation.current=preparation.then(()=>undefined,()=>undefined);
    (async()=>{
      try{
        const current=await preparation;
        if(!alive||engine.current!==studio||startupGeneration!==projectGeneration.current)return;
        if (current) {
          await studio.loadProject(
            current.project as Parameters<StudioEditor["loadProject"]>[0],
          );
          if (!alive || engine.current !== studio || startupGeneration!==projectGeneration.current) return;
          nameRef.current=current.name;
          setName(current.name);
          restoreMode(current.project as {kind?:string;content?:unknown});
        } else await studio.loadTemplate(TEMPLATES[0].id);
        if (!alive || engine.current !== studio || startupGeneration!==projectGeneration.current) return;
        resize();
        studio.fit();
        stableProject.current={id:startupId,name:current?.name??TEMPLATES[0].name,project:studio.serialize(current?.name??TEMPLATES[0].name)};
        localStorage.setItem('visro-active-design',startupId);
        initializedProject.current=true;
        if (alive) setReady(true);
      } catch (e) {
        notify(
          e instanceof Error ? e.message : "Could not restore the design.",
        );
      }
    })();
    return () => {
      if(initializedProject.current&&!switchingProject.current){try{studio.flushPendingChanges();stableProject.current={id:activeId.current,name:nameRef.current,project:studio.serialize(nameRef.current)};}catch{/* Preserve the last complete snapshot during a cancelled load. */}}
      alive = false;
      observer.disconnect();
      accessRef.current?.dispose();accessRef.current=null;studio.destroy();
      if (engine.current === studio) engine.current = null;
      clearTimeout(errorTimer.current);
    };
  }, [notify]);
  useEffect(() => {
    if (!ready || !initializedProject.current || !engine.current || switchingProject.current) return;
    const studio = engine.current, id = activeId.current, revision = state.revision;
    const generation=projectGeneration.current;
    const timer = setTimeout(async () => {
      if (engine.current !== studio || id !== activeId.current || switchingProject.current || generation!==projectGeneration.current) return;
      try {
        await studio.whenIdle();
        if(engine.current!==studio||id!==activeId.current||switchingProject.current||generation!==projectGeneration.current||revision!==studio.getState().revision||name!==nameRef.current)return;
        await storeDesign({ id, name, updated: Date.now(), project: studio.serialize(name) });
        if (id === activeId.current && engine.current === studio && name === nameRef.current && !switchingProject.current && generation===projectGeneration.current) studio.markSaved(revision);
      } catch { notify("Autosave is unavailable. Use Save to keep a project file."); }
    }, 800);
    return () => clearTimeout(timer);
  }, [state.revision, name, ready, notify]);
  const clipboardPrefix='Visro design elements\n';
  const copyCanvas=useCallback(async(cut=false)=>{
    const studio=engine.current;if(!studio)return;const ids=studio.canvas.getActiveObjects().map(o=>(o as unknown as {id:string}).id);
    const objects=await studio.exportSelectedObjects();if(!objects.length)return;
    browserClipboardRef.current=objects;
    const plainText=objects.map(o=>typeof o.text==='string'?o.text:'').filter(Boolean).join('\n')||'Visro elements';
    try{if(desktop)await desktop.writeCanvasClipboard({objects,plainText});else{try{await navigator.clipboard.writeText(clipboardPrefix+JSON.stringify(objects));}catch{await studio.copy();}}}
    catch(e){notify(e instanceof Error?e.message:'Could not copy this selection.');return;}
    if(cut&&ids.join('|')===studio.canvas.getActiveObjects().map(o=>(o as unknown as {id:string}).id).join('|'))studio.remove();
  },[notify]);
  const pasteCanvas=useCallback(async()=>{const studio=engine.current;if(!studio)return;try{
    if(desktop){const data=await desktop.readCanvasClipboard();if(!data)return;if(data.kind==='objects')await studio.insertObjects(data.objects);else if(data.kind==='image')await studio.addImage(data.data);else if(data.kind==='text'&&data.text){studio.addText('body');studio.updateSelected({text:data.text});}}
    else {let text:string;try{text=await navigator.clipboard.readText();}catch{if(browserClipboardRef.current.length){await studio.insertObjects(browserClipboardRef.current);return;}await studio.paste();return;}if(text.startsWith(clipboardPrefix))await studio.insertObjects(JSON.parse(text.slice(clipboardPrefix.length)));else if(text){studio.addText('body');studio.updateSelected({text});}}

  }catch(e){notify(e instanceof Error?e.message:'Could not paste this content.');}},[notify]);
  useEffect(()=>{const paste=(e:ClipboardEvent)=>{if((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]'))return;if(!ready||switchingProject.current||!initializedProject.current)return;const files=Array.from(e.clipboardData?.items||[]).filter(i=>i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean) as File[];e.preventDefault();
    if(files.length){void uploadFiles(files);return;}const text=e.clipboardData?.getData('text/plain')||'';if(text.startsWith(clipboardPrefix)){void work('Pasting elements',()=>engine.current!.insertObjects(JSON.parse(text.slice(clipboardPrefix.length))));}
    else if(text){engine.current?.addText('body');engine.current?.updateSelected({text});}else void pasteCanvas();
  };window.addEventListener('paste',paste);return()=>window.removeEventListener('paste',paste);},[pasteCanvas,work,ready]);
  useEffect(() => {
    if (desktop)
      desktop
        .getSettings()
        .then((s) => {
          setSettings(s);
          setTextModel(s.textModel);
          setImageModel(s.imageModel);
          setVoiceModel(s.voiceModel);setVideoModel(s.videoModel);
        })
        .catch((e) => notify(e.message));
  }, [notify]);
  useEffect(()=>{if(!timerRunning)return;const t=setInterval(()=>setTimerSeconds(v=>v+1),1000);return()=>clearInterval(t);},[timerRunning]);
  useEffect(()=>{
    if(!ready||home||mode!=="design")return;
    let cancelled=false,idle:number|undefined;
    const origin=activeId.current,generation=projectGeneration.current;
    const task=setTimeout(()=>{
      const run=async()=>{
        if(cancelled||interactionRef.current)return;
        const studio=engine.current;if(!studio)return;
        try{
          const {activePageId:id,revision}=studio.getState();
          const data=await studio.exportImage({format:'jpeg',scale:.12,quality:.6});
          if(!cancelled&&engine.current===studio&&generation===projectGeneration.current&&revision===studio.getState().revision)publishPagePreview(id,data,origin);
        }catch{/* The page remains usable without a thumbnail. */}
      };
      if('requestIdleCallback'in window)idle=window.requestIdleCallback(()=>void run());else void run();
    },1100);
    return()=>{cancelled=true;clearTimeout(task);if(idle!==undefined&&'cancelIdleCallback'in window)window.cancelIdleCallback(idle);};
  },[state.revision,state.activePageId,ready,home,mode,publishPagePreview]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      const studio=engine.current;if(!ready||home||mode!=='design'||switchingProject.current||!studio?.isTextEditing()||event.isComposing)return;
      const target=event.target as HTMLElement;if(target!==(studio.canvas.getActiveObject() as unknown as {hiddenTextarea?:HTMLTextAreaElement}|undefined)?.hiddenTextarea)return;
      let handled=false;
      if(!event.metaKey&&!event.ctrlKey&&!event.altKey){
        if(event.key==='Enter'&&!event.shiftKey)handled=studio.continueSelectedTextList();
        else if(event.key==='Tab')handled=studio.indentSelectedTextList(event.shiftKey?-1:1);
      }else if((event.metaKey||event.ctrlKey)&&!event.altKey){
        const selected=studio.getSelected();if(!selected||selected.type!=='text')return;
        const key=event.key.toLowerCase();
        if(['b','i','u'].includes(key)){studio.updateSelectedTextStyle(key==='b'?{fontWeight:Number(selected.fontWeight)>=600||selected.fontWeight==='bold'?400:700}:key==='i'?{fontStyle:selected.fontStyle==='italic'?'normal':'italic'}:{underline:!selected.underline});handled=true;}
      }
      if(handled){event.preventDefault();event.stopImmediatePropagation();}
    };
    window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
  },[ready,home,mode]);
  useEffect(()=>{if(mode!=='design'&&editingMode!=='editing'){setEditingMode('editing');void accessRef.current?.setMode('editing');}},[mode,editingMode]);
  const save = useCallback(async () => {
    if (!engine.current || saving.current) return;
    saving.current = true;
    try{await work("Saving your design", async () => {
      const studio=await waitForStableStudio();
      studio.flushPendingChanges();
      const id=activeId.current,projectName=nameRef.current,generation=projectGeneration.current,revision=studio.getState().revision;
      const project = packProject(studio.serialize(projectName));
      let saved=false;
      if (desktop) {
        const result = await desktop.saveProject({
          project,
          name: projectName,
          saveAs: nativeSavedId.current !== id,
        });
        if (result) {
          if(id===activeId.current&&generation===projectGeneration.current)nativeSavedId.current=id;
          saved=true;notify("Project saved. You can open it again in Visro.");
        }
      } else {
        await saveProjectFallback(project, safeName(projectName));
        saved=true;notify("Project file downloaded.");
      }
      if(saved&&engine.current===studio&&id===activeId.current&&generation===projectGeneration.current&&!switchingProject.current)studio.markSaved(revision);
    });}finally{saving.current = false;}
  }, [notify, work, waitForStableStudio]);
  const open = useCallback(async () => {
    if (desktop)
      await work("Opening your project", async () => {
        const result = await desktop!.openProject();
        if (result) {
          const doc = unpackProject(result.project) as Parameters<
            StudioEditor["loadProject"]
          >[0];
          if(await switchProject(async()=>({id:crypto.randomUUID(),name:doc.name||"Untitled design",project:doc,nativeFile:true})))notify("Project opened.");
        }
      });
    else projectRef.current?.click();
  }, [notify, work, switchProject]);
  const newDesign = useCallback(async () => {
    if(await switchProject(async()=>({id:crypto.randomUUID(),name:"Untitled design",project:createProject("Untitled design",1080,1080,"#ffffff")})))notify("A fresh canvas, ready for your next idea.");
  }, [notify,switchProject]);
  const historyEdit=useCallback((redo=false)=>{
    if(mode==='sheet'){document.querySelector<HTMLButtonElement>(`.sheet-suite [aria-label="${redo?'Redo':'Undo'} sheet edit"]`)?.click();return;}
    if(mode==='document'){document.querySelector<HTMLButtonElement>(`[aria-label="${redo?'Redo':'Undo'} document edit"]`)?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));return;}
    if(mode==='video'){const studio=engine.current;if(studio)void (redo?studio.redo():studio.undo()).then(()=>{if(engine.current===studio)setMediaEpoch(v=>v+1);}).catch(error=>notify(error instanceof Error?error.message:'Could not restore this video edit.'));return;}
    if(redo)void engine.current?.redo();else void engine.current?.undo();
  },[mode,notify]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if(publicImagePreviewOpen)return;
      if(e.key==='Escape'){if(cropSource){setCropSource(null);return;}if(maskSources){setMaskSources(null);return;}if(guidesDialog){setGuidesDialog(false);return;}if(elementDialog){setElementDialog(null);return;}if(contextMenu){setContextMenu(null);return;}if(modal){setModal(null);return;}if(toolbarPopover){setToolbarPopover(null);return;}if(fileMenu){setFileMenu(false);return;}}
      if(quickActionsOpen)return;
      if(cropSource||maskSources)return;
      if(textMenuOpen||contextMenu&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
      const target = e.target as HTMLElement;
      if (target.closest('input,textarea,select,[contenteditable="true"]'))
        return;
      if(!e.metaKey&&!e.ctrlKey&&!e.altKey&&(e.key==='Enter'||e.code==='Space')&&target.closest('button,a[href],summary,[role="button"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="switch"]'))return;
      const focusedTab=target.closest<HTMLElement>('[role="tab"]'),tabList=focusedTab?.closest('[role="tablist"]');
      if(focusedTab&&tabList&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)){
        const tabs=Array.from(tabList.querySelectorAll<HTMLElement>('[role="tab"]')).filter(tab=>!tab.hasAttribute('disabled')&&tab.getAttribute('aria-disabled')!=='true'&&tab.getClientRects().length);
        const current=tabs.indexOf(focusedTab),vertical=tabList.getAttribute('aria-orientation')==='vertical';
        if(current>=0){
          if((vertical&&['ArrowLeft','ArrowRight'].includes(e.key))||(!vertical&&['ArrowUp','ArrowDown'].includes(e.key)))return;
          e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(current+(e.key==='ArrowRight'||e.key==='ArrowDown'?1:-1)+tabs.length)%tabs.length;
          tabs[next]?.focus({preventScroll:true});tabs[next]?.click();return;
        }
      }
      if(!ready||switchingProject.current||!initializedProject.current)return;
      if(home || guidesDialog || (modal&&e.key!=='Escape'))return;
      const studio=engine.current;
      if(studio?.isTextEditing())return;
      const cmd = e.metaKey || e.ctrlKey;
      if(desktop&&cmd&&e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key))return;
      if((cmd&&e.code==='KeyE')||(!cmd&&!e.altKey&&e.key==='/')){e.preventDefault();setQuickActionsOpen(true);return;}
      if(cmd&&e.code==='Slash'){e.preventDefault();setPanelOpen(v=>!v);setInspectorOpen(false);return;}
      if(cmd&&e.altKey&&e.code==='Semicolon'){e.preventDefault();setViewSettings(v=>({...v,locked:!v.locked}));return;}
      if(cmd&&e.altKey&&['Digit2','Digit3'].includes(e.code)){e.preventDefault();setPagesOpen(true);setGridView(e.code==='Digit3');return;}
      if(cmd&&e.altKey&&e.code==='KeyP'){e.preventDefault();void showPresent();return;}
      if(cmd&&e.code==='F2'){e.preventDefault();const canvas=studio?.canvas.upperCanvasEl;if(canvas){canvas.tabIndex=0;canvas.focus({preventScroll:true});}return;}
      if(cmd&&e.code==='F1'){e.preventDefault();document.querySelector<HTMLButtonElement>('.context-toolbar button')?.focus();return;}
      if(cmd&&e.code==='F3'){e.preventDefault();setPanelOpen(true);requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('.asset-panel input')?.focus());return;}
      if(e.shiftKey&&e.code==='F10'){e.preventDefault();const bounds=studio?.getSelectionBounds(),rect=viewportRef.current?.getBoundingClientRect();if(bounds&&rect)setContextMenu({x:rect.left+bounds.left+bounds.width/2,y:rect.top+bounds.top+bounds.height});return;}
      if(e.altKey&&e.shiftKey&&e.code==='KeyL'){e.preventDefault();const selected=studio?.getSelected();if(selected)studio?.setLayerLocked(selected.id,!selected.locked);return;}
      if(e.altKey&&!cmd&&['Comma','Period'].includes(e.code)){e.preventDefault();studio?.rotateSelection((e.shiftKey?15:1)*(e.code==='Comma'?-1:1));return;}
      if(e.key==='Tab'&&!cmd&&(target===document.body||target.closest('canvas'))&&mode==='design'){e.preventDefault();studio?.cycleSelection(e.shiftKey?-1:1);return;}
      if(e.shiftKey&&!cmd&&!e.altKey&&e.code==='KeyR'){e.preventDefault();setViewSettings(v=>({...v,rulers:!v.rulers}));return;}
      if(e.key==='Escape'&&contextMenu){e.preventDefault();setContextMenu(null);return;}
      if(e.altKey&&!cmd&&e.code==='Digit1'){e.preventDefault();setPositionTab("layers");setInspectorOpen(true);setPanelOpen(false);return;}
      if(e.code==='Space'&&!cmd){e.preventDefault();studio?.setPanMode(true);return;}
      if(cmd&&e.altKey&&e.key.toLowerCase()==='c'){e.preventDefault();studio?.copyStyle();return;}
      if(cmd&&e.altKey&&e.key.toLowerCase()==='v'){e.preventDefault();studio?.pasteStyle();return;}
      if(cmd&&e.key.toLowerCase()==='k'){e.preventDefault();if(!studio?.getSelected()){notify('Select an element first.');return;}setElementDialog({kind:e.altKey?'component':'link',value:e.altKey?(selected?.name||'Component'):(selected?.metadata?.link||'')});return;}
      if(cmd&&e.altKey&&e.key.toLowerCase()==='n'){e.preventDefault();setCommentsOpen(true);return;}
      if(cmd&&['=','+','-'].includes(e.key)){e.preventDefault();studio?.setZoom((studio.getState().zoom||.5)*(e.key==='-'?1/1.1:1.1));return;}
      if(cmd&&e.key==='0'){e.preventDefault();studio?.fit();return;}
      if(cmd&&e.shiftKey&&['KeyL','KeyR','KeyC','KeyJ'].includes(e.code)&&selected?.type==='text'){e.preventDefault();studio?.updateSelected({align:e.code==='KeyL'?'left':e.code==='KeyR'?'right':e.code==='KeyC'?'center':'justify'});return;}
      if(cmd&&['b','i','u'].includes(e.key.toLowerCase())&&selected?.type==='text'){e.preventDefault();const k=e.key.toLowerCase();studio?.updateSelected(k==='b'?{fontWeight:selected.fontWeight==='bold'||selected.fontWeight===700?400:700}:k==='i'?{fontStyle:selected.fontStyle==='italic'?'normal':'italic'}:{underline:!selected.underline});return;}

      if (desktop && cmd && !e.altKey && ["s","o","z","y","c","x","v","a","n","=","+","-","0",","].includes(e.key.toLowerCase())) return;
      if (cmd && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (cmd && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void open();
      } else if(cmd&&e.key.toLowerCase()==="y"){e.preventDefault();historyEdit(true);}
      else if(cmd&&(e.key==="Delete"||e.key==="Backspace")){e.preventDefault();if(engine.current!.getState().pages.length>1)void engine.current?.deletePage();}
      else if (cmd && e.key.toLowerCase() === "z") {
        e.preventDefault();
        historyEdit(e.shiftKey);
      } else if (cmd && e.key.toLowerCase() === "c") {
        e.preventDefault(); void copyCanvas();
      } else if (cmd && e.key.toLowerCase() === "x") {
        e.preventDefault(); void copyCanvas(true);
      } else if (cmd && e.key.toLowerCase() === "v") {
        // Browser paste events decide between clipboard images and copied objects.
      } else if (cmd && e.key.toLowerCase() === "a") {
        e.preventDefault();engine.current?.selectAll();
      } else if (cmd && e.key.toLowerCase() === "d") {
        e.preventDefault();
        engine.current?.duplicate();
      } else if ((e.key === "Backspace" || e.key === "Delete") && !e.metaKey) {
        e.preventDefault();
        engine.current?.remove();
      } else if (cmd && e.key.toLowerCase()==="g") {
        e.preventDefault();if(e.shiftKey)engine.current?.ungroup();else engine.current?.group();
      } else if (cmd && ["[","]"].includes(e.key)) {
        e.preventDefault();engine.current?.arrange(e.key==="["?(e.altKey?"back":"down"):(e.altKey?"front":"up"));
      } else if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) {
        if(studio?.getSelected()){e.preventDefault();const step=e.shiftKey?10:1,dx=e.key==="ArrowLeft"?-step:e.key==="ArrowRight"?step:0,dy=e.key==="ArrowUp"?-step:e.key==="ArrowDown"?step:0;if(cmd)studio.resizeSelection(dx,dy);else studio.nudge(dx,dy);}
      } else if (e.key === "Escape") {
        setModal(null);engine.current?.deselect();
        setDrawing(false);
        engine.current?.setDrawing(false);
      } else if (e.key === "Enter" && cmd) {e.preventDefault();void engine.current?.addPage();}
      else if(e.key==="Enter"&&!cmd){e.preventDefault();engine.current?.editSelectedText();}
      else if (e.key === "t" && !cmd) engine.current?.addText("heading");
      else if(e.key==="r"&&!cmd)engine.current?.addShape("rect");
      else if(e.key==="c"&&!cmd)engine.current?.addShape("circle");
      else if(e.key==="l"&&!cmd)engine.current?.addShape("line");
    };
    const keyup=(e:KeyboardEvent)=>{if(e.code==='Space')engine.current?.setPanMode(false);if(e.key.startsWith('Arrow'))engine.current?.flushPendingChanges();};
    const blur=()=>{engine.current?.setPanMode(false);engine.current?.flushPendingChanges();};
    window.addEventListener("keydown",key);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keydown',key);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);};
  }, [save,open,home,modal,selected,contextMenu,elementDialog,toolbarPopover,fileMenu,cropSource,maskSources,copyCanvas,ready,notify,guidesDialog,historyEdit,quickActionsOpen,mode,publicImagePreviewOpen,textMenuOpen]);
  useEffect(() => {
    if (!desktop) return;
    return desktop.onMenu((action) => {
      if(publicImagePreviewOpen)return;
      if((!ready||switchingProject.current)&&!["new","open","settings","save","save-as"].includes(action))return;
      if (action === "save") void save();
      else if (action === "open") void open();
      else if (action === "new") void newDesign();
      else if (action === "export") setModal("export");
      else if (action === "save-as") {
        nativeSavedId.current = null;
        void save();
      } else if (action === "zoom-in")
        engine.current?.setZoom(engine.current.getState().zoom * 1.1);
      else if (action === "zoom-out") engine.current?.setZoom(engine.current.getState().zoom / 1.1);
      else if (action === "fit") engine.current?.fit();
      else if (action === "copy") void copyCanvas();
      else if (action === "cut") void copyCanvas(true);
      else if (action === "paste") void pasteCanvas();
      else if (action === "select-all") engine.current?.selectAll();
      else if (action === "settings") setModal("settings");
      else if (action === "undo") historyEdit();
      else if (action === "redo") historyEdit(true);
    });
  }, [save,open,newDesign,mode,copyCanvas,pasteCanvas,ready,historyEdit,publicImagePreviewOpen]);
  const choosePanel = (p: Panel) => {
    setPanel(p);setPanelOpen(true);setInspectorOpen(false);
    if(p==="projects")void listDesignSummaries().then(setLibrary);
    if(p==="uploads")void listAssets(["image","logo"]).then(a=>{for(const asset of a)if(asset.source)photoSources.current.set(asset.data,asset.source);setUploads(a.map(v=>v.data));});
    if(p==="components")void listAssets(["component"]).then(setComponents);
    if (p === "video") setMode("video");
    if (p === "documents") setMode("document");
    if (p === "sheets") setMode("sheet");
    setSearch("");
    if (p !== "draw") {
      setDrawing(false);
      engine.current?.setDrawing(false);
    }
  };
  const importPublicImage=async(image:Pick<PublicImage,'id'>,options?:{signal?:AbortSignal;prepared?:PublicImageResult;targetFrameId?:string},center?:{x:number;y:number})=>{
    const studio=engine.current;if(!studio||!ready||switchingProject.current)return;
    const id=activeId.current,generation=projectGeneration.current,pageId=studio.getState().activePageId,target=replaceTarget?.pageId===studio.getState().activePageId?replaceTarget:null;
    const result=options?.prepared?.id===image.id?options.prepared:await fetchPublicImage({id:image.id,size:'image'},options?.signal);
    if(options?.signal?.aborted)throw new DOMException('Adding this photo was cancelled.','AbortError');
    const source={id:result.id,title:result.title,artist:result.artist,license:result.license,licenseUrl:result.licenseUrl,sourceUrl:result.sourceUrl};
    await storeAsset({id:`public-photo-${result.id}`,name:result.name,data:result.data,kind:'image',source,updated:Date.now()});
    photoSources.current.set(result.data,source);setUploads(previous=>[result.data,...previous.filter(data=>data!==result.data)]);
    if(options?.signal?.aborted)throw new DOMException('Adding this photo was cancelled.','AbortError');
    if(engine.current!==studio||activeId.current!==id||projectGeneration.current!==generation||switchingProject.current||studio.getState().activePageId!==pageId){notify('Photo saved in Uploads. The design changed while it was loading.');return;}
    if(target&&!center&&!options?.targetFrameId){await studio.replaceImageById(target.id,result.data,source,{signal:options?.signal});setReplaceTarget(null);}else await studio.addImage(result.data,result.name,{center,pageId,source,signal:options?.signal,targetFrameId:options?.targetFrameId});
  };
  const useTemplate = useCallback((id:string,templateName:string)=>void work('Applying template',async()=>{
    if(home){if(!await switchProject(async()=>({id:crypto.randomUUID(),name:templateName,load:studio=>studio.loadTemplate(id)})))return;}else{const template=TEMPLATES.find(t=>t.id===id);if(template){const w=state.width,h=state.height;await engine.current!.insertDesign({...template,width:w,height:h,elements:template.elements.map(e=>({...e,x:e.x*w/template.width,y:e.y*h/template.height,width:(e.width||200)*w/template.width,height:(e.height||200)*h/template.height,fontSize:e.fontSize?e.fontSize*Math.min(w/template.width,h/template.height):undefined}))});}}
    setMode('design');contentRef.current=undefined;setHome(false);
  }),[work,home,state.width,state.height,switchProject]);
  const uploadFiles = async (files: FileList | File[] | null,placement?:{center:{x:number;y:number};pageId:string;targetFrameId?:string}) => {
    if (!files) return;
    const studio=engine.current,id=activeId.current,generation=projectGeneration.current,pageId=studio?.getState().activePageId,replacementId=placement?null:replaceImageRef.current||(replaceTarget&&replaceTarget.pageId===pageId?replaceTarget.id:null);
    replaceImageRef.current=null;
    const stillHere=()=>studio&&engine.current===studio&&activeId.current===id&&projectGeneration.current===generation&&!switchingProject.current&&studio.getState().activePageId===pageId;
    await work("Adding your images", async () => {
      let firstImage=true;
      for (const file of Array.from(files)) {
        if(file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf")){if(await switchProject(async()=>({id:crypto.randomUUID(),name:file.name.replace(/\.pdf$/i,""),load:studio=>importPDF(file,studio,setBusy)})))notify("PDF pages imported for annotation.");continue;}
        if (file.type === "image/svg+xml" || file.name.endsWith(".svg")) {
          if (file.size > 5 * 1024 * 1024) throw new Error("Choose an SVG smaller than 5 MB.");
          const svg=await file.text();if(stillHere())await studio!.addSVG(svg);continue;
        }
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
        await storeAsset({id:crypto.randomUUID(),name:file.name,data,kind:"image",updated:Date.now()});
        if(!stillHere()){notify("Image saved in Uploads. The design changed while it was loading.");continue;}
        if(firstImage&&replacementId){await studio!.replaceImageById(replacementId,data);setReplaceTarget(null);}else await studio!.addImage(data,file.name,{...placement,pageId,targetFrameId:firstImage?placement?.targetFrameId:undefined});firstImage=false;
      }
    });
  };
  const removeBackground = () =>
    void work("Preparing background removal", async () => {
      const studio=engine.current,generation=projectGeneration.current,pageId=studio?.getState().activePageId;
      const current = studio?.getSelected();
      if (!current || current.type !== "image")
        throw new Error("Select an image first.");
      const original = await studio!.selectedImageDataURL();
      const data = await removeImageBackground(original, (label, percent) => {
        setBusy(label);
        setBusyPercent(percent);
      });
      if(engine.current!==studio||projectGeneration.current!==generation||studio?.getState().activePageId!==pageId||studio?.getSelected()?.id!==current.id||accessRef.current?.getMode()!=='editing'){notify('Background removal finished. Select the original photo and run it again to apply it.');return;}
      await studio!.replaceSelectedImage(data);
      notify("Background removed. Your image now has true transparency.");
    });
  const exportDesign = () =>
    void work("Exporting your design", async () => {
      if(mode==="document"&&exportFormat==="pdf"){if(!desktop)throw new Error("Export document PDFs from the Mac app.");const html=sanitizeDocument(document.querySelector(".document-paper")?.innerHTML||String(engine.current?.getProjectContent()||""));const result=await desktop.printDocument({name:safeName(name),html:`<html><meta charset="utf-8"><body>${html}</body></html>`});if(!result)return;}
      else if(exportFormat === "pptx") { await exportPowerPoint(safeName(name),engine.current!); }
      else if (exportFormat === "html") {
        const pages = await engine.current!.exportPages(1);
        const project=engine.current!.serialize(name);
        const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHTML(name)+'</title><style>*{box-sizing:border-box}body{margin:0;background:#fff}main{max-width:1440px;margin:auto}section{position:relative}img{width:100%;display:block}.design-link{position:absolute;inset:0}.design-link:focus-visible{outline:3px solid #8b3dff}</style></head><body><main>'+pages.map(p=>'<section id="'+p.id+'"><img src="'+p.dataURL+'" alt="'+escapeHTML(p.name)+'">'+pageLinks(project,p.id).map(link=>'<a class="design-link" href="'+escapeHTML(link.url)+'" aria-label="'+escapeHTML(link.label)+'" style="clip-path:polygon('+link.polygon+')"'+(link.url.startsWith('http')?' target="_blank" rel="noopener noreferrer"':'')+'></a>').join('')+'</section>').join('')+'</main></body></html>';

        await saveExport(safeName(name), "html", 'data:text/html;base64,'+btoa(Array.from(new TextEncoder().encode(html),b=>String.fromCharCode(b)).join("")));
      } else if (exportFormat === "pdf") {
        const { jsPDF } = await import("jspdf");
        const pages = await engine.current!.exportPages(1.5);
        const project=engine.current!.serialize(name);
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
          for(const link of pageLinks(project,page.id)){if(link.url.startsWith('http')||link.url.startsWith('mailto:'))pdf.link(link.left,link.top,link.width,link.height,{url:link.url});}
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
      setLibrary(await listDesignSummaries());
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
  useEffect(() => {
    if(modal!=="present"||!presentAuto)return;
    const duration=state.pages[presentIndex]?.metadata?.duration||5;
    const timer=setTimeout(()=>{if(presentIndex<state.pages.length-1)void movePresent(1);else setPresentAuto(false);},duration*1000);
    return()=>clearTimeout(timer);
  },[modal,presentAuto,presentIndex,state.pages]);
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
  const goHome = () => void work("Saving your workspace", async () => {
    const studio=await waitForStableStudio();studio.flushPendingChanges();
    const id=activeId.current,projectName=nameRef.current,generation=projectGeneration.current;
    const project=studio.serialize(projectName);
    const thumbnail=await studio.exportImage({format:"jpeg",scale:0.22,quality:0.7});
    if(generation!==projectGeneration.current||id!==activeId.current||engine.current!==studio)return;
    await storeDesign({id,name:projectName,updated:Date.now(),project,thumbnail});
    if(generation===projectGeneration.current&&id===activeId.current){setHomeRefresh(v=>v+1);setHome(true);}
  });
  const openDesign = (d:SavedDesign) => void work("Opening design", async () => {
    forgetClosedTab(d.id);
    await switchProject(async()=>{const record=await getDesign(d.id);if(!record)throw new Error("This project is no longer available.");return{id:d.id,name:record.name,project:record.project as Parameters<StudioEditor['loadProject']>[0]};});
  });
  const createFormat = (w:number,h:number,title:string) => void work("Creating design", async () => {
    if(title==="Custom size"){await newDesign();setSize({w,h});setModal("resize");return;}
    const doc=createProject(title.toLowerCase().startsWith("untitled")?title:`Untitled ${title.toLowerCase()}`,w,h,"#ffffff");
    doc.kind=title==="Document"?"document":title==="Sheet"?"sheet":title==="Video"?"video":title==="Website"?"website":title==="Whiteboard"?"whiteboard":"design";
    await switchProject(async()=>({id:crypto.randomUUID(),name:doc.name,project:doc}));
  });
  const importFonts = async (files:FileList|null) => void work("Loading font", async () => {
    const studio=engine.current,generation=projectGeneration.current,targetId=studio?.getSelected()?.id;
    for(const file of Array.from(files||[])){if(file.size>15*1024*1024)throw new Error("Choose a font smaller than 15 MB.");const family=file.name.replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9 _-]/g,"");const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error("Could not read font."));r.readAsDataURL(file);});const font=new FontFace(family,`url(${data})`);await font.load();document.fonts.add(font);await storeAsset({id:crypto.randomUUID(),name:family,data,kind:"font",updated:Date.now()});setCustomFonts(f=>[...new Set([...f,family])]);if(studio&&engine.current===studio&&generation===projectGeneration.current&&targetId&&studio.getSelected()?.id===targetId)studio.updateSelectedTextStyle({fontFamily:family});notify(`${family} is ready to use.`);}
  });
  const update = (changes: Parameters<StudioEditor["updateSelected"]>[0]) => {
    const textStyleKeys=['fill','stroke','strokeWidth','fontSize','fontFamily','fontWeight','fontStyle','underline','linethrough','align','lineHeight','letterSpacing','charSpacing'];
    if(selected?.type==='text'&&Object.keys(changes).every(key=>textStyleKeys.includes(key)))engine.current?.updateSelectedTextStyle(changes);
    else engine.current?.updateSelected(changes);
  };
  const openWorkspaceTab=(id:string)=>void work('Opening design',async()=>{
    forgetClosedTab(id);
    if(id===activeId.current&&ready){setHome(false);setWorkspaceTabs(tabs=>upsertWorkspaceTab(tabs,{id,name:nameRef.current}));return;}
    await switchProject(async()=>{
      const record=await getDesign(id);
      if(!record){setWorkspaceTabs(tabs=>tabs.filter(t=>t.id!==id));throw new Error('This design is no longer in your local library.');}
      return{id:record.id,name:record.name,project:record.project as Parameters<StudioEditor['loadProject']>[0]};
    });
  });
  const closeWorkspaceTab=(id:string)=>void work('Saving design',async()=>{
    const tab=workspaceTabsRef.current.find(t=>t.id===id);if(!tab||closingTabIds.current.has(id))return;
    closingTabIds.current.add(id);
    const requestedGeneration=projectGeneration.current;
    try{
      if(id===activeId.current){
        const studio=await waitForStableStudio();
        // A different tab may have finished opening while the editor was busy.
        if(id===activeId.current){studio.flushPendingChanges();const projectName=nameRef.current,project=studio.serialize(projectName);await storeDesign({id,name:projectName,updated:Date.now(),project});}
      }
      closedTabs.current=[tab,...closedTabs.current.filter(t=>t.id!==id)].slice(0,10);closedTabIds.current.add(id);localStorage.setItem('visro-closed-tabs',JSON.stringify(closedTabs.current));
      const index=workspaceTabsRef.current.findIndex(t=>t.id===id);
      setWorkspaceTabs(tabs=>tabs.filter(t=>t.id!==id));
      if(id!==activeId.current||requestedGeneration!==projectGeneration.current)return;
      const remaining=workspaceTabsRef.current,next=remaining[Math.min(index,remaining.length-1)];
      if(next){await switchProject(async()=>{
        const candidate=workspaceTabsRef.current.find(t=>t.id===next.id)??workspaceTabsRef.current[0];
        const record=candidate&&await getDesign(candidate.id);
        if(!record)throw new Error('This design is no longer in your local library.');
        return{id:record.id,name:record.name,project:record.project as Parameters<StudioEditor['loadProject']>[0]};
      });}
      else{setHomeRefresh(v=>v+1);setHome(true);}
    }finally{closingTabIds.current.delete(id);}
  });
  workspaceActionRef.current=(action:string)=>{
    if(publicImagePreviewOpen)return;
    if(action==='home')goHome();
    else if(action==='close-design'){if(!home)closeWorkspaceTab(activeId.current);}
    else if(action==='reopen-design'){const tab=closedTabs.current.shift();if(tab)openWorkspaceTab(tab.id);}
    else if(action==='next-tab'||action==='previous-tab'){const index=workspaceTabs.findIndex(t=>t.id===activeId.current),next=workspaceTabs[(index+(action==='next-tab'?1:-1)+workspaceTabs.length)%workspaceTabs.length];if(next)openWorkspaceTab(next.id);}
    else if(action.startsWith('tab-')){const index=Number(action.slice(4))-1,tab=workspaceTabs[index===8?workspaceTabs.length-1:index];if(tab)openWorkspaceTab(tab.id);}
  };
  useEffect(()=>{if(!desktop)return;return desktop.onMenu(action=>workspaceActionRef.current(action));},[]);
  const quickActions:QuickAction[]=[
    {id:'text',label:'Add text',shortcut:'T',run:()=>engine.current?.addText('heading')},
    ...(['rect','circle','line','triangle','star'] as const).map(type=>({id:type,label:`Add ${type==='rect'?'rectangle':type}`,shortcut:type==='rect'?'R':type==='circle'?'C':type==='line'?'L':'',run:()=>engine.current?.addShape(type)})),
    {id:'photos',label:'Search public-domain photos',keywords:'images pictures stock',run:()=>{choosePanel('elements');setElementsTab('photos');}},
    {id:'templates',label:'Search templates',keywords:'designs layouts',run:()=>choosePanel('templates')},
    {id:'layers',label:'Show layers panel',shortcut:'⌥1',run:()=>{setPositionTab('layers');setInspectorOpen(true);setPanelOpen(false);}},
    {id:'position',label:'Show position panel',keywords:'align arrange geometry',run:()=>{setPositionTab('arrange');setInspectorOpen(true);setPanelOpen(false);}},
    {id:'duplicate',label:'Duplicate selection',shortcut:'⌘D',disabled:!selected,run:()=>void engine.current?.duplicate()},
    {id:'group',label:'Group selection',shortcut:'⌘G',disabled:!selected||selected.count<2,run:()=>engine.current?.group()},
    {id:'ungroup',label:'Ungroup selection',shortcut:'⇧⌘G',disabled:!selected,run:()=>engine.current?.ungroup()},
    {id:'lock',label:selected?.locked?'Unlock element':'Lock element',shortcut:'⌥⇧L',disabled:!selected,run:()=>{if(selected)engine.current?.setLayerLocked(selected.id,!selected.locked);}},
    ...(['front','back','up','down'] as const).map(direction=>({id:`arrange-${direction}`,label:direction==='front'?'Bring to front':direction==='back'?'Send to back':direction==='up'?'Bring forward':'Send backward',disabled:!selected,run:()=>engine.current?.arrange(direction)})),
    ...(['left','center','right','top','middle','bottom'] as const).map(direction=>({id:`align-${direction}`,label:`Align ${direction}`,disabled:!selected,run:()=>engine.current?.align(direction)})),
    {id:'background',label:'Remove background',keywords:'photo cutout bg remover',disabled:selected?.type!=='image',run:()=>void removeBackground()},
    {id:'crop',label:'Crop photo',disabled:selected?.type!=='image',run:openCrop},
    {id:'guides',label:'Show rulers and guides',shortcut:'⇧R',run:()=>setViewSettings(v=>({...v,rulers:!v.rulers}))},
    {id:'gridguides',label:'Add guides',keywords:'columns rows margins',run:()=>setGuidesDialog(true)},
    {id:'addpage',label:'Add page',shortcut:'⌘Return',run:()=>void engine.current?.addPage()},
    {id:'duplicatepage',label:'Duplicate page',run:()=>void engine.current?.duplicatePage()},
    {id:'notes',label:'Show notes',run:()=>setNotesOpen(v=>!v)},
    {id:'comments',label:'Show comments',shortcut:'⌥⌘N',run:()=>setCommentsOpen(true)},
    {id:'fit',label:'Fit canvas',shortcut:'⌘0',run:()=>engine.current?.fit()},
    {id:'present',label:'Present design',shortcut:'⌥⌘P',run:()=>void showPresent()},
    {id:'download',label:'Download design',keywords:'export png jpg pdf powerpoint',run:()=>setModal('export')},
    {id:'save',label:'Save project',shortcut:'⌘S',run:()=>void save()},
    {id:'settings',label:'Visro settings',shortcut:'⌘,',keywords:'Gemini API key theme',run:()=>setModal('settings')},
  ];

  const nav = [
    {id:'templates' as const,label:'Templates',Icon:TemplatesIcon},{id:'elements' as const,label:'Elements',Icon:ElementsIcon},{id:'text' as const,label:'Text',Icon:TextIcon},{id:'brand' as const,label:'Brand',Icon:BrandIcon},{id:'uploads' as const,label:'Uploads',Icon:UploadsIcon},{id:'draw' as const,label:'Tools',Icon:ToolsIcon},{id:'projects' as const,label:'Projects',Icon:ProjectsIcon},{id:'apps' as const,label:'Apps',Icon:AppsIcon},{id:'components' as const,label:'Components',Icon:ComponentsIcon},{id:'audio' as const,label:'Audio',Icon:AudioIcon},{id:'background' as const,label:'Background',Icon:BackgroundIcon},{id:'charts' as const,label:'Charts',Icon:ChartsIcon},
  ];
  const bounds=selected?engine.current?.getSelectionBounds():null;
  const selectionActionsPosition=bounds?{left:Math.max(8,Math.min(bounds.left+bounds.width/2-82,(viewportRef.current?.clientWidth||800)-172)),top:Math.max(8,Math.min(bounds.top>=118?bounds.top-62:bounds.top+bounds.height+64,(viewportRef.current?.clientHeight||600)-44))}:null;
  const activeColour=colourTarget==='effect'?selected?.shapeEffect?.color||'#000000':colourTarget==='effect2'?selected?.shapeEffect?.color2||'#00ffff':colourTarget==='stroke'?selected?.stroke||'#000000':selected?.vectorColors?.length?(graphicColorTarget&&selected.vectorColors.includes(graphicColorTarget)?graphicColorTarget:selected.vectorColors[0]):selected?.strokeOnly?selected.stroke:selected?.fill||state.background;
  const applyColour=(color:string)=>{if(selected&&(colourTarget==='effect'||colourTarget==='effect2'))void engine.current?.setShapeEffect(colourTarget==='effect'?{color}:{color2:color});else if(selected&&colourTarget==='stroke')update({stroke:color});else if(selected?.vectorColors?.length){engine.current?.setGraphicColor(activeColour,color);setGraphicColorTarget(color);}else if(selected)update(selected.strokeOnly?{stroke:color}:{fill:color});else engine.current?.setBackground(color);};
  const openColour=(color?:string,target:typeof colourTarget='fill')=>{const value=color??(selected?.strokeOnly?selected.stroke:selected?.fill||state.background);setColourTarget(target);setGraphicColorTarget(selected?.vectorColors?.length?value:null);setColorHex(value);choosePanel('color');};
  const colourPaint=(color:string,gradient?:{type?:'linear'|'radial';colors:string[];angle:number})=>gradient?`${gradient.type==='radial'?'radial-gradient(circle,':`linear-gradient(${gradient.angle+90}deg,`}${gradient.colors.join(',')})`:color;
  const onElementAction=(action:ElementAction)=>{
    const studio=engine.current,cur=studio?.getSelected();if(!studio)return;
    if(['front','back','up','down'].includes(action))studio.arrange(action as 'front'|'back'|'up'|'down');
    else if(['top','left','middle','center','bottom','right'].includes(action))studio.align(action as 'top'|'left'|'middle'|'center'|'bottom'|'right');
    else if(action==='copy')void copyCanvas();else if(action==='paste')void pasteCanvas();else if(action==='copy-style')studio.copyStyle();else if(action==='paste-style')studio.pasteStyle();
    else if(action==='duplicate')void studio.duplicate();else if(action==='delete')studio.remove();else if(action==='group')studio.group();else if(action==='ungroup')studio.ungroup();
    else if(action==='lock'||action==='unlock'){if(cur)studio.setLayerLocked(cur.id,action==='lock');}
    else if(action==='show-layers'){setPositionTab("layers");setInspectorOpen(true);setPanelOpen(false);}
    else if(action==='comment')setCommentsOpen(true);
    else if(action==='component')setElementDialog({kind:'component',value:cur?.name||'Component'});
    else if(action==='link')setElementDialog({kind:'link',value:cur?.metadata?.link||''});
    else if(action==='alt')setElementDialog({kind:'alt',value:cur?.metadata?.altText||''});
    else if(action==='timing'){choosePanel('tools');setToolTab('animate');}
    else if(action==='write'||action==='translate'){setAiKind(action==='write'?'rewrite':'translate');choosePanel('ai');}
    else if(action==='frame')void work('Changing shape to frame',()=>studio.convertSelectedShapeToFrame());
    else if(action==='crop')openCrop();
    else if(action==='background'&&cur?.type==='image')studio.setSelectedImageAsBackground();
  };
  return (
    <div className={`studio-app ${desktop?"native-desktop":""} ${inspectorOpen?"inspector-open position-open":panelOpen?"panel-open":""} ${commentsOpen?"comments-open":""} ${notesOpen?"notes-open":""} ${home?"home-open":""}`}>
      {home && <Home dark={dark} onTheme={toggleTheme} onSettings={()=>setModal("settings")} refresh={homeRefresh} onOpen={openDesign} onCreate={createFormat} onTemplate={useTemplate} onImport={()=>projectRef.current?.click()} onNavigate={p=>{setHome(false);choosePanel(p);}}/>}
      <div className="desktop-tabs"><button className="desktop-home-tab" aria-label="Home" title="Home (⇧⌘H)" onClick={goHome}><StudioIcon name="home" size={22}/></button><div className="desktop-tab-list" role="tablist" aria-label="Open designs">{workspaceTabs.map(tab=><div key={tab.id} className={`desktop-tab-shell ${!home&&tab.id===activeId.current?'active':''}`}><button className="desktop-tab" role="tab" aria-selected={!home&&tab.id===activeId.current} onClick={()=>openWorkspaceTab(tab.id)}><StudioIcon name="presentation" size={19}/><span>{tab.name} — Visro</span></button><button className="desktop-tab-close" aria-label={`Close ${tab.name} tab`} onClick={()=>closeWorkspaceTab(tab.id)}><X size={14}/></button></div>)}</div><button className="desktop-new-tab" aria-label="New design" title="New design (⌘T)" onClick={()=>void newDesign()}><Plus size={22}/></button></div>
      <header className="topbar">
        <div ref={fileMenuRef} className="top-menu-wrap"><button className="quiet-button top-menu" aria-expanded={fileMenu} onClick={()=>setFileMenu(!fileMenu)}>File <ChevronDown size={13}/></button>{fileMenu&&<div className="file-menu">{[["New design",()=>void newDesign()],["Open project",()=>void open()],["Save project",()=>void save()],["Your projects",goHome],["Version history",()=>{choosePanel("tools");setToolTab("versions");}]].map(([label,fn])=><button key={String(label)} onClick={()=>{setFileMenu(false);(fn as ()=>void)();}}>{String(label)}</button>)}
          <div className="file-settings-wrap" onMouseEnter={()=>setViewMenu(true)}><button className="file-settings-trigger" aria-expanded={viewMenu} onClick={()=>setViewMenu(true)} onKeyDown={e=>{if(e.key==='ArrowRight'){e.preventDefault();setViewMenu(true);}}}>Settings <ChevronRight size={15}/></button>{viewMenu&&<div className="file-menu view-settings-menu">
            {([['rulers','Show rulers and guides','⇧R'],['margins','Show margins',''],['snapping','Snap to elements',''],['locked','Lock guides','']] as const).map(([key,label,shortcut])=><button key={key} role="menuitemcheckbox" aria-checked={Boolean(viewSettings[key])} onClick={()=>setViewSettings(v=>({...v,[key]:!v[key]}))}><span className="menu-check">{viewSettings[key]&&<Check size={15}/>}</span>{label}<kbd>{shortcut}</kbd></button>)}
            <button onClick={()=>{setGuidesDialog(true);setFileMenu(false);}}>Add guides</button><button disabled={!state.pageMetadata?.guides?.x.length&&!state.pageMetadata?.guides?.y.length} onClick={()=>engine.current?.setPageMetadata({guides:{x:[],y:[]}})}>Clear guides</button>
          </div>}</div><button onClick={()=>{setFileMenu(false);setModal('settings');}}>Visro settings…</button>
        </div>}</div>
        <button className="quiet-button top-menu" disabled={editingMode!=='editing'} onClick={()=>{setSize({w:state.width,h:state.height});setModal("resize");}}>Resize <ChevronDown size={13}/></button>
        <EditingModeMenu mode={editingMode} disabled={mode!=='design'} onChange={next=>{setEditingMode(next);setPanelOpen(false);setInspectorOpen(false);setToolbarPopover(null);setContextMenu(null);setDrawing(false);setCropSource(null);setMaskSources(null);setElementDialog(null);if(next==='viewing')setCommentsOpen(false);void accessRef.current?.setMode(next);}}/>
        <span className="topbar-mode-divider"/>
        <IconButton title="Undo (⌘Z)" disabled={editingMode!=='editing'||mode==='design'&&!state.canUndo} onClick={()=>historyEdit()}><Undo2 size={18}/></IconButton>
        <IconButton title="Redo (⌘⇧Z)" disabled={editingMode!=='editing'||mode==='design'&&!state.canRedo} onClick={()=>historyEdit(true)}><Redo2 size={18}/></IconButton>
        <div className="document-title">
          <input
            aria-label="Design name"
            readOnly={editingMode!=='editing'}
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
        <div className="top-actions"><button className="avatar" title="Settings" aria-label="Settings" onClick={()=>setModal("settings")}>PS</button><IconButton title="View all comments" active={commentsOpen} onClick={()=>setCommentsOpen(!commentsOpen)}><StudioIcon name="comments" size={24}/></IconButton><button className="quiet-button share-button" onClick={()=>setModal('export')}>Share</button><button className="primary-button" onClick={()=>void showPresent()}><Presentation size={19}/>Present</button></div>
      </header>
      <div className="workspace">
        <nav className="tool-rail" aria-label="Editor tools" inert={editingMode!=='editing'}>
          {nav.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`rail-button ${panel === id && panelOpen ? "selected" : ""}`}
              onClick={() => panel===id&&panelOpen?setPanelOpen(false):choosePanel(id)}
            >
              <span className="rail-icon-wrap"><Icon size={24} strokeWidth={1.5} filled={panel===id&&panelOpen}/></span>
              <span>{label}</span>

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
        <aside inert={editingMode!=='editing'} className={`asset-panel ${panel==='elements'?'elements-panel':''} ${!panelOpen||inspectorOpen?"hidden":""}`} onPointerDownCapture={event=>{if(['font','color'].includes(panel)&&engine.current?.isTextEditing()&&(event.target as HTMLElement).closest('button'))event.preventDefault();}}>
          <div className="panel-heading">
            <div>

              <h2>
                {panel === "templates"
                  ? "Templates"
                  : panel === "elements"
                    ? "Elements"
                    : panel === "text"
                      ? "Text"
                      : panel === "uploads"
                        ? "Uploads"
                        : panel === "ai"
                          ? "Visro AI"
                          : panel === "brand"
                            ? "Brand"
                            : panel === "projects" ? "Projects" : panel === "apps" ? "Apps" : panel === "components" ? "Components" : panel === "audio" ? "Audio" : panel === "background" ? "Background" : panel === "charts" ? "Charts" : panel === "shape-edit" ? "Edit" : panel === "shape-effects" ? "Effects" : panel === "image" ? "Edit image" : panel === "color" ? "Colour" : panel === "font" ? "Font" : panel === "tools" ? toolTab[0].toUpperCase()+toolTab.slice(1) : panel === "video" ? "Video" : panel === "documents" ? "Documents" : panel === "sheets" ? "Sheets" : "Draw"}
              </h2>
            </div>
            <button className="icon-button" aria-label="Close side panel" onClick={()=>setPanelOpen(false)}><X size={20}/></button>
          </div>
          {(panel === "templates" || panel === "elements") && (
            <label className="search-box">
              <Search size={16} />
              <input
                aria-label={panel==='templates'?'Search templates':elementsTab==='photos'?'Search photos':'Search elements'}
                placeholder={
                  panel === "templates"
                    ? "Search templates"
                    : elementsTab==='photos'?"Search photos":"Search elements"
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
              <TemplateBrowser query={search} compact onUse={useTemplate}/>
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
            </>
          )}
          {panel === "elements" && (
            <>
              {elementsTab!=='all'&&<button className="element-library-back" onClick={()=>{setElementsTab('all');setSearch('');}}><ChevronLeft size={18}/>Elements</button>}
              {search.trim()&&<div className="elements-filter-tabs" role="tablist" aria-label="Element categories">{(['all','shapes','graphics','photos','frames','grids'] as const).map(tab=><button key={tab} role="tab" aria-selected={elementsTab===tab} tabIndex={elementsTab===tab?0:-1} onClick={()=>setElementsTab(tab)}>{tab[0].toUpperCase()+tab.slice(1)}</button>)}</div>}
              {elementsTab==='photos'?<PublicImageLibrary query={search} onQueryChange={setSearch} showSearch={false} onInsert={importPublicImage} onNotify={notify} onPreviewChange={setPublicImagePreviewOpen}/>:elementsTab==='graphics'?<GraphicsLibrary query={search} onQueryChange={setSearch} onInsert={graphic=>engine.current?.addGraphic(graphic.id)} onNotify={notify}/>:elementsTab==='shapes'?<ShapeLibrary query={search} onInsert={type=>engine.current?.addShape(type)}/>:elementsTab==='frames'||elementsTab==='grids'?<FrameLibrary kind={elementsTab==='grids'?'grid':'frame'} query={search} onQueryChange={setSearch} onInsert={item=>engine.current!.insertFrame(item.id)} onNotify={notify}/>:<>
                {!search.trim()&&<><div className="element-section-heading"><h3>Browse categories</h3></div><div className="elements-browse-categories">{[
                  {name:'Shapes',icon:'elements',run:()=>setElementsTab('shapes')},{name:'Graphics',icon:'components',run:()=>setElementsTab('graphics')},{name:'Photos',icon:'image',run:()=>setElementsTab('photos')},
                  {name:'Videos',icon:'video',run:()=>choosePanel('video')},{name:'Audio',icon:'audio',run:()=>choosePanel('audio')},{name:'Charts',icon:'charts',run:()=>choosePanel('charts')},
                  {name:'Sheets',icon:'sheet',run:()=>choosePanel('sheets')},{name:'Tables',icon:'sheet',run:()=>{choosePanel('tools');setToolTab('tables');}},{name:'Frames',icon:'frames',run:()=>setElementsTab('frames')},
                  {name:'Grids',icon:'grid',run:()=>setElementsTab('grids')},
                ].map(item=><button key={item.name} onClick={item.run}><span><StudioIcon name={item.icon as Parameters<typeof StudioIcon>[0]["name"]} size={28}/></span>{item.name}</button>)}</div></>}
                <div className="element-section-heading"><h3>Shapes</h3><button onClick={()=>setElementsTab('shapes')}>See all</button></div><ShapeLibrary query={search} compact onInsert={type=>engine.current?.addShape(type)}/>
                <GraphicsLibrary query={search} onQueryChange={setSearch} compact onBrowse={()=>setElementsTab('graphics')} onInsert={graphic=>engine.current?.addGraphic(graphic.id)} onNotify={notify}/>
                <FrameLibrary kind="frame" query={search} compact onBrowse={()=>setElementsTab('frames')} onInsert={item=>engine.current!.insertFrame(item.id)} onNotify={notify}/>
                <FrameLibrary kind="grid" query={search} compact onBrowse={()=>setElementsTab('grids')} onInsert={item=>engine.current!.insertFrame(item.id)} onNotify={notify}/>
              </>}

            </>
          )}
          {panel==='shape-edit'&&<ShapeLibrary onInsert={type=>void work('Changing shape',async()=>{await engine.current?.replaceShape(type);})}/>}
          {panel==='shape-effects'&&(selected?.canShapeEffect?<ShapeEffects effect={selected.shapeEffect} disabled={editingMode!=='editing'||selected.locked} onChange={patch=>{void engine.current?.setShapeEffect(patch).catch(error=>notify(error instanceof Error?error.message:'The shape effect could not be changed.'));}}/>:<p className="small-hint">Select a shape to edit its effects.</p>)}
          {panel === "text" && (
            <>
              <button
                className="full-button dark"
                onClick={() => engine.current?.addText("body")}
              >
                <Plus size={17} />
                Add a text box
              </button>
              <div className="section-label">Default text styles</div>
              <button
                className="text-preset heading"
                draggable onDragStart={e=>e.dataTransfer.setData("text/visro-asset",JSON.stringify({kind:"text",role:"heading"}))}
                onClick={() => engine.current?.addText("heading")}
              >
                Add a heading
                <Plus size={18} />
              </button>
              <button
                className="text-preset subheading"
                draggable onDragStart={e=>e.dataTransfer.setData("text/visro-asset",JSON.stringify({kind:"text",role:"subheading"}))}
                onClick={() => engine.current?.addText("subheading")}
              >
                Add a subheading
                <Plus size={17} />
              </button>
              <button
                className="text-preset body"
                onClick={() => engine.current?.addText("body")}
              >
                Add a little bit of body text
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
                Upload files
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
                <strong>Upload images</strong>
                <span>
                  Drop an image, or click to browse.
                  <br />
                  PNG, JPG, WebP, GIF · up to 30 MB
                </span>
              </div>
              {uploads.length > 0 && (
                <>
                  {replaceTarget&&<div className="replace-image-hint"><span>Choose an image to replace this photo.</span><button onClick={()=>setReplaceTarget(null)}>Cancel</button></div>}
                  <button className="full-button" onClick={()=>{choosePanel('elements');setElementsTab('photos');}}>Browse photos</button><div className="section-label">Images</div>
                  <div className="upload-grid">
                    {uploads.map((src, i) => (
                      <button
                        key={i}
                        draggable onDragStart={e=>e.dataTransfer.setData("text/visro-asset",JSON.stringify({kind:"image",src}))}
                        onClick={() => void work("Adding image",async()=>{const studio=engine.current;if(!studio)return;if(replaceTarget?.pageId===studio.getState().activePageId){await studio.replaceImageById(replaceTarget.id,src,photoSources.current.get(src));setReplaceTarget(null);}else await studio.addImage(src,"Image",{source:photoSources.current.get(src)});})}
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
          {panel==='ai'&&<Suspense fallback={<p className="small-hint">Opening Magic Media…</p>}><MagicMediaPanel key={aiKind} initialKind={aiKind} getEditor={getEditor} settings={settings} onSettings={()=>setModal('settings')} onNotify={notify} onMode={m=>{setMode(m);if(m==='video')setMediaEpoch(v=>v+1);}}/></Suspense>}
          {panel==='brand'&&<><BrandKitsPanel brand={brand} getEditor={getEditor} onNotify={notify} getSelectedPhoto={()=>engine.current!.selectedImageDataURL()}/><button className="full-button" onClick={()=>fontRef.current?.click()}><Upload size={18}/>Upload a font</button></>}
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
          {panel==='font'&&<div className="feature-panel"><label className="search-box"><Search size={18}/><input aria-label="Search fonts" placeholder="Search fonts" value={search} onChange={e=>setSearch(e.target.value)}/></label><button className="full-button" onClick={()=>fontRef.current?.click()}><Upload size={18}/>Upload a font</button>{selected?.type==='text'&&<label className="font-weight-control">Style<select aria-label="Font weight" value={Number(selected.fontWeight)||({bold:700,normal:400}[String(selected.fontWeight) as 'bold'|'normal']||400)} onChange={event=>update({fontWeight:Number(event.target.value)})}>{TEXT_FONT_WEIGHTS.map(weight=><option key={weight.value} value={weight.value}>{weight.label}</option>)}</select></label>}<div className="font-list">{fontOptions.filter(f=>f.toLowerCase().includes(search.toLowerCase())).map(f=><button key={f} style={{fontFamily:f}} className={selected?.fontFamily===f?'active':''} onClick={()=>update({fontFamily:f})}>{f}{selected?.fontFamily===f&&<Check size={18}/>}</button>)}</div></div>}
          {panel==='color'&&<div className="feature-panel"><h3>Document colours</h3><div className="swatches">{[...new Set([...brand.colors,...COLORS])].map(c=><button key={c} title={c} aria-label={`Apply ${c}`} style={{background:c}} onClick={()=>applyColour(c)}/>)}</div><label className="field-label">Hex colour<input aria-label="Hex colour" placeholder="#000000" value={colorHex} onChange={e=>{setColorHex(e.target.value);if(/^#[0-9a-f]{6}$/i.test(e.target.value))applyColour(e.target.value);}}/></label><label className="field-label">Add a new colour<input aria-label="Custom colour" type="color" value={/^#[0-9a-f]{6}$/i.test(activeColour)?activeColour:'#000000'} onChange={e=>applyColour(e.target.value)}/></label>{colourTarget==='fill'&&!selected?.vectorColors?.length&&!selected?.strokeOnly&&<><h3>Gradients</h3><ToolsPanel tab="gradients" setTab={setToolTab} getEditor={getEditor} state={state} designId={activeId.current} onAction={(label,job)=>void work(label,job)} onNotify={notify}/></>}</div>}

          {panel==='image'&&<ImageControls getEditor={getEditor} selected={selected} onRemove={removeBackground} onMask={()=>void work('Opening mask editor',async()=>setMaskSources(await engine.current!.getImageMaskSources()))} onAI={()=>{setAiKind('edit');choosePanel('ai');}} onReplace={()=>{replaceImageRef.current=selected?.id||null;uploadRef.current?.click();}}/>}
          {panel==='projects'&&<div className="project-panel"><div className="chip-row"><button className="chip active">All</button><button className="chip" onClick={goHome}>Folders</button></div>{library.map(d=><button key={d.id} className="project-panel-card" onClick={()=>openDesign(d)}>{d.thumbnail?<img src={d.thumbnail} alt=""/>:<FileText size={32}/>}<span>{d.name}</span></button>)}<button className="full-button" onClick={()=>void open()}>Open project file</button></div>}
          {panel==='apps'&&<div className="feature-panel"><label className="search-box"><Search size={18}/><input aria-label="Search apps" placeholder="Search apps" value={search} onChange={e=>setSearch(e.target.value)}/></label><h3>Discover</h3><div className="apps-grid">{[{name:'Magic Media',icon:'ai',action:()=>{setAiKind('image');choosePanel('ai');}},{name:'Magic Write',icon:'document',action:()=>{setAiKind('copy');choosePanel('ai');}},{name:'Bulk create',icon:'sheet',action:()=>{choosePanel('tools');setToolTab('bulk');}},{name:'QR code',icon:'apps',action:()=>{choosePanel('tools');setToolTab('qr');}},{name:'Video',icon:'video',action:()=>{setMode('video');setPanelOpen(false);}},{name:'Translate',icon:'text',action:()=>{setAiKind('translate');choosePanel('ai');}}].filter(a=>a.name.toLowerCase().includes(search.toLowerCase())).map(a=><button key={a.name} onClick={a.action}><StudioIcon name={a.icon as Parameters<typeof StudioIcon>[0]['name']} size={32}/><span>{a.name}</span></button>)}</div></div>}
          {panel==='components'&&<div className="feature-panel"><p className="small-hint">Your reusable elements. Right-click an element and choose Create component to add one.</p>{components.map(c=><button className="full-button" key={c.id} onClick={()=>void work('Adding component',()=>engine.current!.insertObjects(JSON.parse(c.data)))}><StudioIcon name="components" size={24}/>{c.name}</button>)}</div>}
          {(panel==='background'||panel==='charts')&&<ToolsPanel tab={panel==='charts'?'charts':'gradients'} setTab={setToolTab} getEditor={getEditor} state={state} designId={activeId.current} onAction={(label,job)=>void work(label,job)} onNotify={notify}/>}
          {panel==='audio'&&<div className="feature-panel"><button className="full-button coral" onClick={()=>{setAiKind('voice');choosePanel('ai');}}>Generate voice</button><button className="full-button" onClick={()=>{setMode('video');setPanelOpen(false);}}>Open audio timeline</button><p className="small-hint">Upload or arrange audio in your video timeline.</p></div>}
          {panel === "tools" && <ToolsPanel tab={toolTab} setTab={setToolTab} getEditor={getEditor} state={state} designId={activeId.current} onAction={(label,job)=>void work(label,job)} onNotify={notify}/>}
          {["video","documents","sheets"].includes(panel) && <div className="feature-panel"><h3>{panel==="video"?"Video studio":panel==="documents"?"Document editor":"Spreadsheet editor"}</h3><p className="small-hint">Create and edit in the workspace.</p><button className="full-button" onClick={()=>setMode("design")}>Return to design canvas</button><button className="full-button coral" onClick={()=>setMode(panel==="documents"?"document":panel==="sheets"?"sheet":"video")}>Open {panel}</button><button className="full-button" onClick={()=>{choosePanel("ai");setAiKind("copy");}}>Write with Visro AI</button></div>}
        </aside>
        <main className="canvas-workspace">
          {(selected||mode!=='design')&&<div className="canvas-toolbar context-toolbar" onPointerDownCapture={event=>{if(engine.current?.isTextEditing()&&(event.target as HTMLElement).closest('button'))event.preventDefault();}}>
            <div className="toolbar-left">
              {selected?.type === "text" ? <>
                <button className="toolbar-select" aria-label="Text font" onClick={()=>choosePanel("font")}>{selected.fontFamily}<ChevronDown size={14}/></button>
                <div className="font-size-control"><IconButton title="Decrease font size" onClick={()=>update({fontSize:Math.max(1,selected.fontSize-1)})}><Minus size={16}/></IconButton><input className="toolbar-number" aria-label="Text size" type="number" min={1} max={600} value={Number(selected.fontSize.toFixed(2))} onChange={e=>update({fontSize:Number(e.target.value)})}/><IconButton title="Increase font size" onClick={()=>update({fontSize:selected.fontSize+1})}><Plus size={16}/></IconButton></div>
                <button className="toolbar-text-colour" aria-label="Text colour" title="Text colour" onClick={()=>openColour()}><span style={{borderBottom:`3px solid ${selected.fill}`}}>A</span></button>
                <TextFormatting selected={selected} onAction={action=>engine.current?.formatSelectedText(action)} onUpdate={update} onOpenChange={setTextMenuOpen} moreOptions={false}/>
                <IconButton title="Spacing" active={toolbarPopover==='spacing'} onClick={()=>setToolbarPopover(toolbarPopover==='spacing'?null:'spacing')}><StudioIcon name="spacing" size={22}/></IconButton>
              </> : selected?.type === "image" ? <>
                <button className="toolbar-button" onClick={()=>choosePanel("image")}>Edit</button>
                <button className="toolbar-button" onClick={()=>{setReplaceTarget({id:selected.id,pageId:state.activePageId});choosePanel('uploads');}}>Replace</button>
                <button className="toolbar-button" onClick={removeBackground}>BG Remover</button>
                <button className="toolbar-button" onClick={()=>void work("Opening mask editor",async()=>setMaskSources(await engine.current!.getImageMaskSources()))}>Eraser</button>
                <StrokeStyle selected={selected} onUpdate={update}/><CornerRounding selected={selected} onChange={radius=>engine.current?.setCornerRadius(radius)}/>
                <button className="toolbar-button" onClick={openCrop}>Crop</button><button className="toolbar-button" onClick={()=>setToolbarPopover(toolbarPopover==='flip'?null:'flip')}>Flip <ChevronDown size={13}/></button>
              </> : selected ? <>
                {selected.count===1&&!['group','activeselection'].includes(selected.type)&&!selected.strokeOnly&&!selected.vectorColors?.length&&<button className="toolbar-button" onClick={()=>choosePanel('shape-edit')}>Edit</button>}
                {selected.vectorColors?.length?selected.vectorColors.map((color,index)=><button key={index} className="toolbar-color" aria-label={`Graphic colour ${index+1}`} title={`Change ${color}`} style={{background:color}} onClick={()=>openColour(color)}/>):<><button className="toolbar-color" aria-label={selected.strokeOnly?"Line colour":"Shape colour"} style={{background:colourPaint(selected.strokeOnly?selected.stroke:selected.fill,selected.strokeOnly?selected.strokeGradient:selected.fillGradient)}} onClick={()=>openColour()}/>{!selected.strokeOnly&&selected.strokeWidth>0&&<button className="toolbar-color toolbar-stroke-colour" aria-label="Stroke colour" title="Stroke colour" style={{background:colourPaint(selected.stroke,selected.strokeGradient)}} onClick={()=>openColour(selected.stroke,'stroke')}/>}</>}
                {!selected.vectorColors?.length&&<StrokeStyle selected={selected} onUpdate={update}/>}<CornerRounding selected={selected} onChange={radius=>engine.current?.setCornerRadius(radius)}/>
                {selected.lineStyle&&<LineEditing selectionId={selected.id} lineStyle={selected.lineStyle} disabled={editingMode!=='editing'||selected.locked} onUpdate={patch=>engine.current?.updateLineStyle(patch)} onSwap={()=>engine.current?.swapSelectedLineEnds()}/>}
                {Boolean(selected.vectorColors?.length)&&!selected.shapeEffect&&<button className="toolbar-button" onClick={()=>engine.current?.ungroup()}>Ungroup</button>}
              </> : <>
                <button className="toolbar-color" aria-label="Page colour" style={{background:state.background}} onClick={()=>openColour()}/>
                <button className="toolbar-button" onClick={()=>{choosePanel("tools");setToolTab("gradients");}}>Background</button>
                <button className="toolbar-button" onClick={()=>{setSize({w:state.width,h:state.height});setModal("resize");}}>{state.width} × {state.height}</button>
              </>}
              {selected&&<IconButton title="Transparency" active={toolbarPopover==='transparency'} onClick={()=>setToolbarPopover(toolbarPopover==='transparency'?null:'transparency')}><StudioIcon name="transparency" size={24}/></IconButton>}
              {selected?.type==='text'&&<button className="toolbar-button" onClick={()=>{choosePanel('tools');setToolTab('effects');}}>Effects</button>}
              {selected?.shapeEffect&&selected.shapeEffect.type!=='none'&&<><button className="toolbar-color" aria-label="Shape effect colour" title="Effect colour" style={{background:selected.shapeEffect.color}} onClick={()=>openColour(selected.shapeEffect!.color,'effect')}/>{selected.shapeEffect.type==='glitch'&&<button className="toolbar-color" aria-label="Second shape effect colour" title="Second effect colour" style={{background:selected.shapeEffect.color2}} onClick={()=>openColour(selected.shapeEffect!.color2,'effect2')}/>}</>}
              {selected?.canShapeEffect&&!selected.lineStyle&&<button className={`toolbar-button ${panel==='shape-effects'&&panelOpen?'active':''}`} aria-pressed={panel==='shape-effects'&&panelOpen} onClick={()=>choosePanel('shape-effects')}>Effects</button>}
              <button className="toolbar-button" onClick={()=>{choosePanel("tools");setToolTab("animate");}}>Animate</button>
            </div>
            <div className="toolbar-right">
              <button className={`toolbar-button ${inspectorOpen?"active":""}`} onClick={()=>{setPositionTab("arrange");setInspectorOpen(!inspectorOpen);setPanelOpen(false);}}>Position</button>
              {selected&&<span className="toolbar-divider"/>}{selected&&<IconButton title="Copy style (⌥⌘C)" onClick={()=>{if(engine.current?.copyStyle()){stylePaintRef.current=true;notify("Click another element to apply this style.");}}}><StudioIcon name="paint-roller" size={24}/></IconButton>}

              {mode!=="design"&&<button className="toolbar-button" onClick={()=>setMode("design")}>Design</button>}
            </div>
          </div>}
          {toolbarPopover&&selected&&<div className="toolbar-popover">{toolbarPopover==='flip'?<><button className="full-button" onClick={()=>engine.current?.flip('x')}><FlipHorizontal size={18}/>Flip horizontal</button><button className="full-button" onClick={()=>engine.current?.flip('y')}><FlipVertical size={18}/>Flip vertical</button></>:toolbarPopover==='spacing'?<><NumberField label="Letter spacing" value={selected.letterSpacing} min={-200} max={1000} onChange={n=>update({letterSpacing:n})}/><NumberField label="Line spacing" value={selected.lineHeight} min={.5} max={5} step={.05} onChange={n=>update({lineHeight:n})}/></>:<label className="range-label">Transparency<span>{Math.round(selected.opacity*100)}</span><input type="range" aria-label="Transparency" min={0} max={100} value={Math.round(selected.opacity*100)} onChange={e=>update({opacity:Number(e.target.value)/100})}/></label>}</div>}
          <div
            className="canvas-viewport"
            style={{pointerEvents:ready?undefined:"none"}}
            ref={viewportRef}
            onPointerDown={e=>{if((e.target as HTMLElement).closest('canvas')){interactionRef.current=true;viewportRef.current?.classList.add('interacting');const canvas=engine.current?.canvas.upperCanvasEl;if(canvas&&!engine.current?.isTextEditing()){canvas.tabIndex=0;canvas.focus({preventScroll:true});}}}}
            onPointerUp={()=>{interactionRef.current=false;viewportRef.current?.classList.remove('interacting');}}
            onContextMenuCapture={e=>{e.preventDefault();if(mode!=='design'||editingMode!=='editing')return;const studio=engine.current;if(!studio)return;const r=viewportRef.current!.getBoundingClientRect(),page=(e.target as HTMLElement).closest<HTMLElement>('[data-page-id]'),pageId=page?.dataset.pageId,pageBox=page?.getBoundingClientRect(),zoom=studio.canvas.getZoom(),scene=pageBox?{x:(e.clientX-pageBox.left)/zoom,y:(e.clientY-pageBox.top)/zoom}:null,generation=projectGeneration.current,point={x:e.clientX-r.left,y:e.clientY-r.top},menu={x:e.clientX,y:e.clientY};void(async()=>{if(pageId&&pageId!==studio.getState().activePageId){if(pageNavigator.current)await pageNavigator.current(pageId);else await studio.setPage(pageId);await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}if(generation!==projectGeneration.current||engine.current!==studio)return;const v=studio.canvas.viewportTransform,location=scene?{x:scene.x*v[0]+v[4],y:scene.y*v[3]+v[5]}:point;const cur=studio.selectAt({...location,includeLocked:true});if(cur)setContextMenu(menu);})().catch(error=>notify(error instanceof Error?error.message:'The element menu could not be opened.'));}}
            onDragOver={(e) => e.preventDefault()}
            onDrop={e=>{e.preventDefault();const studio=engine.current;if(editingMode!=='editing'||!studio||!ready||switchingProject.current)return;setReplaceTarget(null);replaceImageRef.current=null;
              const origin=activeId.current,generation=projectGeneration.current,r=viewportRef.current!.getBoundingClientRect(),v=studio.canvas.viewportTransform,dropPage=(e.target as HTMLElement).closest<HTMLElement>('[data-page-id]'),pageBox=dropPage?.getBoundingClientRect(),pageId=dropPage?.dataset.pageId||studio.getState().activePageId;
              const center=pageBox?{x:(e.clientX-pageBox.left)/v[0],y:(e.clientY-pageBox.top)/v[0]}:{x:(e.clientX-r.left-v[4])/v[0],y:(e.clientY-r.top-v[5])/v[3]};
              const payload={frame:e.dataTransfer.getData('text/visro-frame'),graphic:e.dataTransfer.getData('text/visro-graphic'),publicPhoto:e.dataTransfer.getData('text/visro-public-image'),asset:e.dataTransfer.getData('text/visro-asset'),files:Array.from(e.dataTransfer.files)};
              void work('Adding element',async()=>{
                if(pageId!==studio.getState().activePageId){if(pageNavigator.current)await pageNavigator.current(pageId);else await studio.setPage(pageId);}
                if(origin!==activeId.current||generation!==projectGeneration.current||switchingProject.current||engine.current!==studio)return;
                const targetFrameId=studio.frameAt(center)||undefined;
                if(payload.frame){const data=JSON.parse(payload.frame);if(typeof data.id!=='string')throw new Error('Choose a frame from Elements.');await studio.insertFrame(data.id,{center,pageId});return;}
                if(payload.graphic){const data=JSON.parse(payload.graphic);if(typeof data.id!=='string')throw new Error('Choose a graphic from Elements.');studio.addGraphic(data.id,{center,pageId});return;}
                if(payload.publicPhoto){const photo=JSON.parse(payload.publicPhoto);if(typeof photo.id!=='string')throw new Error('Choose a photo from the image library.');await importPublicImage(photo,{targetFrameId},center);return;}
                if(payload.asset){const asset=JSON.parse(payload.asset);if(asset.kind==='image'&&typeof asset.src==='string')await studio.addImage(asset.src,'Image',{center,pageId,targetFrameId,source:photoSources.current.get(asset.src)});else if(asset.kind==='shape')studio.addShape(asset.type,{center,pageId});else if(asset.kind==='text')studio.addText(asset.role||'body',{center,pageId});return;}
                if(payload.files.length)await uploadFiles(payload.files,{center,pageId,targetFrameId});
              });
            }}

          >
            <div className="canvas-interaction-plane"><canvas ref={canvasRef} />
            {mode==='design'&&<CanvasGuides getEditor={getEditor} ready={ready} pageId={state.activePageId} rulers={Boolean(viewSettings.rulers)} margins={Boolean(viewSettings.margins)} locked={Boolean(viewSettings.locked)||editingMode!=='editing'} guides={state.pageMetadata?.guides} onChange={guides=>engine.current?.setPageMetadata({guides})}/>}
            {selected&&bounds&&mode==='design'&&bounds.left+bounds.width>0&&bounds.top+bounds.height>0&&bounds.left<(viewportRef.current?.clientWidth||0)&&bounds.top<(viewportRef.current?.clientHeight||0)&&<div className="selection-actions" style={selectionActionsPosition??undefined}><IconButton title="Comment" onClick={()=>setCommentsOpen(true)}><StudioIcon name="comments" size={24}/></IconButton><IconButton title={selected.locked?'Unlock':'Lock position and appearance'} onClick={()=>engine.current?.setLayerLocked(selected.id,!selected.locked)}>{selected.locked?<StudioIcon name="lock" size={24}/>:<StudioIcon name="unlock" size={24}/>}</IconButton><IconButton title="Duplicate (⌘D)" onClick={()=>void engine.current?.duplicate()}><StudioIcon name="duplicate" size={24}/></IconButton><IconButton title="Delete" onClick={()=>engine.current?.remove()}><StudioIcon name="trash" size={24}/></IconButton><IconButton title="More" onClick={()=>{const r=document.querySelector('.selection-actions [aria-label="More"]')?.getBoundingClientRect();if(r)setContextMenu({x:r.left,y:r.bottom+4});}}><StudioIcon name="more" size={24}/></IconButton></div>}

            </div>
            <ContinuousPages getEditor={getEditor} viewportRef={viewportRef} state={state} enabled={ready&&!home&&mode==='design'} readOnly={editingMode!=='editing'} navigateRef={pageNavigator} projectKey={activeId.current} interacting={interactionRef} thumbnails={pageThumbnails} onPreview={publishPagePreview} onVisiblePage={setVisiblePageIndex} onNotify={notify}/>
            {mode==="document"&&<DocumentEditor key={`doc-${activeId.current}`} id={activeId.current} name={name} getEditor={()=>engine.current} initial={engine.current?.getProjectContent() ?? contentRef.current} onNotify={notify}/>}
            {mode==="sheet"&&<SheetEditor key={`sheet-${activeId.current}`} id={activeId.current} name={name} getEditor={()=>engine.current} initial={engine.current?.getProjectContent() ?? contentRef.current} onNotify={notify}/>}
            {mode==="video"&&<MediaStudio key={`video-${activeId.current}-${mediaEpoch}`} designId={activeId.current} name={name} width={state.width} height={state.height} getEditor={()=>engine.current} initial={engine.current?.getProjectContent() ?? contentRef.current} onNotify={notify}/>}
            {!ready && (
              <div className="canvas-loading">
                <LoaderCircle className="spin" size={23} />
                <span>Opening your creative space…</span>
              </div>
            )}
          </div>
          <div className={`page-strip ${!pagesOpen?"hidden":""} ${gridView?"page-grid-view":""}`}>
            <div className="page-tabs">
              {state.pages.map((p, i) => (
                <button
                  key={p.id}
                  data-preview-page-id={p.id}
                  className={state.activePageId === p.id ? "active" : ""}
                  onClick={() => void engine.current?.setPage(p.id)}
                >
                  <span className="page-mini" style={{background:state.background}}>{pageThumbnails[p.id]&&<img src={pageThumbnails[p.id]} alt=""/>}</span>
                  {i + 1}
                  <span>{p.name}</span>
                </button>
              ))}
              <IconButton
                title="Add page"
                disabled={editingMode!=='editing'}
                onClick={() => engine.current?.addPage()}
              >
                <Plus size={17} />
              </IconButton>
            </div>
            <div className="page-actions" inert={editingMode!=='editing'}>
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
          {notesOpen&&<section className="notes-panel"><div className="panel-heading"><h3>Notes</h3><button aria-label="Close notes" className="icon-button" onClick={()=>setNotesOpen(false)}><X size={18}/></button></div><textarea readOnly={editingMode!=='editing'} aria-label="Speaker notes" placeholder="Add notes for this page" value={state.pageMetadata?.notes||""} onChange={e=>engine.current?.setPageMetadata({notes:e.target.value})}/></section>}
          <footer className="canvas-footer">
            <button className="quiet-button" onClick={()=>setNotesOpen(!notesOpen)}><FileText size={18}/>Notes</button><button className="quiet-button" onClick={()=>setTimerOpen(!timerOpen)}><Clock size={18}/>Timer</button>{timerOpen&&<div className="timer-popover"><strong>{String(Math.floor(timerSeconds/60)).padStart(2,"0")}:{String(timerSeconds%60).padStart(2,"0")}</strong><button onClick={()=>setTimerRunning(!timerRunning)}>{timerRunning?"Pause":"Start"}</button><button onClick={()=>{setTimerRunning(false);setTimerSeconds(0);}}>Reset</button></div>}
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
              <button className="quiet-button" onClick={()=>setPagesOpen(!pagesOpen)}><Grid3X3 size={20}/>Pages</button><span>{Math.min(visiblePageIndex+1,state.pages.length)} / {state.pages.length}</span><IconButton title="Grid view" onClick={()=>{setPagesOpen(true);setGridView(!gridView);}}><Grid2X2 size={20}/></IconButton>
              <IconButton
                title="Fit canvas"
                onClick={() => engine.current?.fit()}
              >
                <Maximize2 size={15} />
              </IconButton>
            </div>
          </footer>
        </main>
        {inspectorOpen&&<PositionPanel getEditor={getEditor} state={state} selected={selected} initialTab={positionTab} onClose={()=>setInspectorOpen(false)}/>}
        {commentsOpen&&<aside className="comments-panel"><div className="panel-heading"><h3>Comments</h3><button aria-label="Close comments" className="icon-button" onClick={()=>setCommentsOpen(false)}><X size={20}/></button></div><fieldset className="comments-content" disabled={editingMode==='viewing'}><ToolsPanel tab="comments" setTab={setToolTab} getEditor={getEditor} state={state} designId={activeId.current} onAction={(label,job)=>void work(label,job)} onNotify={notify}/></fieldset></aside>}
      </div>
      <input
        ref={uploadRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf"
        hidden
        onChange={(e) => {
          void uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input ref={fontRef} type="file" accept=".ttf,.otf,.woff,.woff2" multiple hidden onChange={e=>{void importFonts(e.target.files);e.target.value="";}}/>
      <input
        ref={projectRef}
        type="file"
        accept=".visro,.json,.pdf,.csv"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            void work("Opening your project", async () => {
              if(file.name.toLowerCase().endsWith(".pdf")){if(await switchProject(async()=>({id:crypto.randomUUID(),name:file.name.replace(/\.pdf$/i,""),load:studio=>importPDF(file,studio,setBusy)})))notify("PDF imported. Add text and graphics to annotate each page.");return;}
              if(file.name.toLowerCase().endsWith(".csv")){await switchProject(async()=>{const cells:Record<string,string>={},matrix=parseCSV(await file.text());matrix.slice(0,200).forEach((r,i)=>r.slice(0,26).forEach((v,c)=>cells[String.fromCharCode(65+c)+(i+1)]=v));const project=createProject(file.name.replace(/\.csv$/i,""),1920,1080,"#ffffff");project.kind="sheet";project.content={cells,rows:Math.min(200,Math.max(20,matrix.length)),columns:Math.min(26,Math.max(8,matrix[0]?.length||0))};return{id:crypto.randomUUID(),name:project.name,project};});return;}
              await switchProject(async()=>{if(file.size>100*1024*1024)throw new Error("Choose a Visro project smaller than 100 MB.");const project=unpackProject(JSON.parse(await file.text())) as Parameters<StudioEditor["loadProject"]>[0];return{id:crypto.randomUUID(),name:project.name||"Untitled design",project};});
            });
          e.target.value = "";
        }}
      />
      {quickActionsOpen&&<QuickActions actions={quickActions} onClose={()=>setQuickActionsOpen(false)}/>}
      {contextMenu&&<ElementMenu canUngroup={!selected?.shapeEffect} canFrame={Boolean(selected&&!selected.strokeOnly&&!['image','text','group','activeselection','line'].includes(selected.type))} x={contextMenu.x} y={contextMenu.y} type={selected?.type} count={selected?.count||1} locked={selected?.locked||false} onClose={closeContext} onAction={onElementAction}/>}
      {guidesDialog&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setGuidesDialog(false);}}><section className="modal element-dialog" role="dialog" aria-modal="true" aria-label="Add guides"><button className="modal-close icon-button" aria-label="Close guides" onClick={()=>setGuidesDialog(false)}><X size={20}/></button><h2>Add guides</h2><form onSubmit={e=>{e.preventDefault();const {columns,rows,gap,margin}=guideGrid;const positions=(count:number,size:number)=>{if(!count)return[];const available=size-2*margin-(count-1)*gap;if(available<=0)throw new Error('The margin and gap must fit inside the page.');const cell=available/count;return [...new Set(Array.from({length:count+1},(_,i)=>i===count?size-margin:margin+i*(cell+gap)).flatMap((v,i)=>i>0&&i<count&&gap?[v-gap,v]:[v]))];};try{engine.current?.setPageMetadata({guides:{x:positions(columns,state.width),y:positions(rows,state.height)}});setViewSettings(v=>({...v,rulers:true,snapping:true}));setGuidesDialog(false);}catch(error){notify((error as Error).message);}}}><NumberField label="Columns" value={guideGrid.columns} min={0} max={24} step={1} onChange={columns=>setGuideGrid(v=>({...v,columns:Math.round(columns)}))}/><NumberField label="Rows" value={guideGrid.rows} min={0} max={24} step={1} onChange={rows=>setGuideGrid(v=>({...v,rows:Math.round(rows)}))}/><NumberField label="Gap (px)" value={guideGrid.gap} min={0} max={state.width/2} onChange={gap=>setGuideGrid(v=>({...v,gap}))}/><NumberField label="Margin (px)" value={guideGrid.margin} min={0} max={Math.min(state.width,state.height)/2} onChange={margin=>setGuideGrid(v=>({...v,margin}))}/><button className="full-button coral" type="submit">Add guides</button></form></section></div>}
      {elementDialog&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setElementDialog(null);}}><section className="modal element-dialog"><button className="modal-close icon-button" aria-label="Close" onClick={()=>setElementDialog(null)}><X size={20}/></button><h2>{elementDialog.kind==='link'?'Link':elementDialog.kind==='alt'?'Alternative text':'Create component'}</h2><form onSubmit={e=>{e.preventDefault();void work("Saving element",async()=>{const d=elementDialog;if(d.kind==='component'){const objects=await engine.current!.exportSelectedObjects();await storeAsset({id:crypto.randomUUID(),kind:'component',name:d.value.trim()||'Component',data:JSON.stringify(objects),updated:Date.now()});notify('Component saved. Find it in Components.');}else engine.current?.setElementMetadata(d.kind==='link'?{link:d.value.trim()}:{altText:d.value});setElementDialog(null);});}}><label className="field-label">{elementDialog.kind==='link'?'Enter a link':elementDialog.kind==='alt'?'Describe this element':'Name'}<input autoFocus aria-label={elementDialog.kind==='link'?'Element link':elementDialog.kind==='alt'?'Alternative text':'Component name'} value={elementDialog.value} onChange={e=>setElementDialog({...elementDialog,value:e.target.value})}/></label><button className="full-button coral" type="submit">Save</button></form></section></div>}
      {cropSource&&<ImageCropEditor source={cropSource} onCancel={()=>setCropSource(null)} onDone={async rect=>{engine.current?.cropSelectedImage(rect);setCropSource(null);notify("Image cropped.");}}/>}
      {maskSources&&<ImageMaskEditor original={maskSources.original} current={maskSources.current} onCancel={()=>setMaskSources(null)} onDone={async data=>{await work("Applying mask",async()=>{await engine.current?.applyImageMask(data);setMaskSources(null);notify("Image mask updated.");});}}/>}
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
                <span className="eyebrow">GEMINI</span>
                <h2>Settings</h2>
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
                          imageModel,voiceModel,videoModel,
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
                  <label className="field-label">Appearance<select aria-label="Appearance" value={theme} onChange={e=>setTheme(e.target.value as ThemePreference)}><option value="system">Use system setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
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
                  <div className="field-row"><label className="field-label">Voice model<input aria-label="Voice model" list="gemini-models" value={voiceModel} onChange={e=>setVoiceModel(e.target.value)}/></label><label className="field-label">Video model<input aria-label="Video model" list="gemini-models" value={videoModel} onChange={e=>setVideoModel(e.target.value)}/></label></div>
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
                <h2>Download</h2>
                <p className="modal-intro">
                  Choose a format and download your design.
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
                    <option value="html">Website · Responsive HTML</option><option value="pptx">PowerPoint · PPTX presentation</option>
                  </select>
                </label>
                {exportFormat !== "pdf" && exportFormat !== "svg" && exportFormat !== "html" && exportFormat !== "pptx" && (
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
                    void work('Resizing your design',async()=>{
                      await engine.current?.resizeDesign(size.w,size.h,{scaleContent:true});
                      setModal(null);setHome(false);
                    });
                  }}
                >
                  <Maximize2 size={16} />
                  Resize & adapt design
                </button>
                <button
                  className="full-button"
                  onClick={() =>
                    void work("Adding your page", async () => {
                      await engine.current?.addPage();
                      await engine.current?.resizeDesign(size.w, size.h);
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
                <h2>Projects</h2>
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
                        onClick={()=>{setModal(null);openDesign(d);}}
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
                            setLibrary(await listDesignSummaries());
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
                  key={presentIndex}
                  className={`animation-${state.pages[presentIndex]?.metadata?.animation||"none"}`}
                />
                {state.pages[presentIndex]?.metadata?.notes&&<div className="speaker-notes">{state.pages[presentIndex].metadata?.notes}</div>}
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
                  </span><button className="quiet-button" onClick={()=>setPresentAuto(!presentAuto)}>{presentAuto?"Pause":"Autoplay"}</button>
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
