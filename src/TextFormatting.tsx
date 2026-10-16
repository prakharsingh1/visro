import {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Check, ChevronDown, IndentDecrease, IndentIncrease, Italic, List, ListOrdered, MoreHorizontal, Underline} from 'lucide-react';
import {StudioIcon} from './icons';
import type {SelectionState, SelectionUpdate} from './editor-types';
import {getTextListStyle, numericFontWeight, TEXT_FONT_WEIGHTS} from './text-formatting';
import type {TextFormatAction} from './text-formatting';
import './text-formatting.css';

export interface TextFormattingProps {
  selected: SelectionState;
  onAction: (action: TextFormatAction) => void;
  onUpdate: (update: SelectionUpdate) => void;
  /** Optional existing controls: omit these to retain App-owned spacing/effects. */
  onSpacing?: () => void;
  spacingOpen?: boolean;
  onEffects?: () => void;
  onOpenChange?: (open: boolean) => void;
  moreOptions?: boolean;
}

/** The font, size and colour controls precede this group in the main toolbar. */
export function TextFormatting({selected, onAction, onUpdate, onSpacing, spacingOpen, onEffects, onOpenChange, moreOptions=true}: TextFormattingProps) {
  const [open, setOpen] = useState(false), [position, setPosition] = useState({left: 0, top: 0});
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const originFocus = useRef<HTMLElement | null>(null);
  const previousSelection = useRef(selected.id), notify = useRef(onOpenChange), id = useId();
  notify.current = onOpenChange;
  const disabled = selected.locked;
  const weight = numericFontWeight(selected.fontWeight), listStyle = getTextListStyle(selected.text ?? '');
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) (originFocus.current?.isConnected ? originFocus.current : trigger.current)?.focus({preventScroll: true});
  };
  useEffect(() => {notify.current?.(open); return () => {if (open) notify.current?.(false);};}, [open]);
  useEffect(() => {
    if (previousSelection.current !== selected.id || selected.locked) setOpen(false);
    previousSelection.current = selected.id;
  }, [selected.id, selected.locked]);
  useLayoutEffect(() => {
    if (!open) return;
    originFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : trigger.current;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect(), panel = menu.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = panel?.width || 264, height = panel?.height || 420;
      setPosition({left: Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8)), top: Math.max(8, Math.min(anchor.bottom + 8, window.innerHeight - height - 8))});
    };
    place();
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll: true});
    const onPointer = (event: PointerEvent) => {if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);};
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const observer = new ResizeObserver(place); if (menu.current) observer.observe(menu.current);
    return () => {document.removeEventListener('pointerdown', onPointer, true); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); observer.disconnect();};
  }, [open]);

  const update = (value: SelectionUpdate) => {if (!disabled) onUpdate(value);};
  const action = (value: TextFormatAction) => {if (!disabled) onAction(value);};
  const button = (label: string, content: ReactNode, click: () => void, active = false) => <button type="button" className={`icon-button text-format-button${active ? ' active' : ''}`} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onPointerDown={event => event.preventDefault()} onClick={click}>{content}</button>;
  const alignment = selected.align === 'center' ? <AlignCenter size={19}/> : selected.align === 'right' ? <AlignRight size={19}/> : selected.align === 'justify' ? <AlignJustify size={19}/> : <AlignLeft size={19}/>;
  const menuAction = (callback: () => void) => {callback(); close(true);};

  return <>
    {button('Bold', <Bold size={17}/>, () => update({fontWeight: weight >= 600 ? 400 : 700}), weight >= 600)}
    {button('Italic', <Italic size={17}/>, () => update({fontStyle: selected.fontStyle === 'italic' ? 'normal' : 'italic'}), selected.fontStyle === 'italic')}
    {button('Underline (⌘U)', <Underline size={17}/>, () => update({underline: !selected.underline}), selected.underline)}
    {button('Strikethrough', <StudioIcon name="strikethrough" size={20}/>, () => update({linethrough: !selected.linethrough}), selected.linethrough)}
    {button('Uppercase', <StudioIcon name="uppercase" size={20}/>, () => action({type: 'case', value: 'toggle'}))}
    {button(`Text alignment: ${selected.align}`, alignment, () => {const options = ['left', 'center', 'right', 'justify']; update({align: options[(options.indexOf(selected.align) + 1) % options.length]});})}
    {button('List', listStyle === 'numbered' ? <ListOrdered size={19}/> : <List size={19}/>, () => action({type: 'list', style: 'cycle'}), listStyle === 'bullet' || listStyle === 'numbered')}
    {onSpacing && button('Spacing', <StudioIcon name="spacing" size={20}/>, onSpacing, spacingOpen)}
    {moreOptions&&<button type="button" ref={trigger} className={`icon-button text-format-button${open ? ' active' : ''}`} title="More text options" aria-label="More text options" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} onPointerDown={event => event.preventDefault()} onClick={() => setOpen(!open)} onKeyDown={event => {
      if (event.key === 'ArrowDown') {event.preventDefault(); event.stopPropagation(); setOpen(true); requestAnimationFrame(() => menu.current?.querySelector<HTMLButtonElement>('button')?.focus());}
    }}><MoreHorizontal size={19}/></button>}
    {onEffects && <button type="button" className="toolbar-button" disabled={disabled} onPointerDown={event => event.preventDefault()} onClick={onEffects}>Effects</button>}
    {open && createPortal(<div ref={menu} id={id} className="text-format-menu" role="menu" aria-label="More text options" style={position} onPointerDown={event => event.preventDefault()} onKeyDown={event => {
      if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); close(true); return;}
      if (event.key === 'Tab') {close(); return;}
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        event.stopPropagation();
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')], index = items.indexOf(document.activeElement as HTMLButtonElement);
          items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus();
        }
      }
    }}>
      <div className="text-format-section-label">Font weight <ChevronDown size={13}/></div>
      <div className="text-weight-options" role="group" aria-label="Font weight">{TEXT_FONT_WEIGHTS.map(option => <button type="button" key={option.value} role="menuitemradio" aria-checked={weight === option.value} onClick={() => menuAction(() => update({fontWeight: option.value}))}><span style={{fontWeight: option.value}}>{option.label}</span><small>{option.value}</small>{weight === option.value && <Check size={14}/>}</button>)}</div>
      <div className="text-format-section-label">Text case</div>
      <div role="group" aria-label="Text case">{([{value: 'upper', label: 'UPPERCASE'}, {value: 'lower', label: 'lowercase'}, {value: 'title', label: 'Title Case'}, {value: 'sentence', label: 'Sentence case'}] as const).map(option => <button type="button" role="menuitem" key={option.value} onClick={() => menuAction(() => action({type: 'case', value: option.value}))}>{option.label}</button>)}</div>
      <div className="text-format-section-label">Lists</div>
      <div className="text-list-options" role="group" aria-label="Lists"><button type="button" role="menuitemcheckbox" aria-checked={listStyle === 'bullet'} onClick={() => menuAction(() => action({type: 'list', style: 'bullet'}))}><List size={17}/>Bulleted list</button><button type="button" role="menuitemcheckbox" aria-checked={listStyle === 'numbered'} onClick={() => menuAction(() => action({type: 'list', style: 'numbered'}))}><ListOrdered size={17}/>Numbered list</button><button type="button" role="menuitem" onClick={() => menuAction(() => action({type: 'indent', direction: 1}))}><IndentIncrease size={17}/>Increase indent</button><button type="button" role="menuitem" onClick={() => menuAction(() => action({type: 'indent', direction: -1}))}><IndentDecrease size={17}/>Decrease indent</button></div>
    </div>, document.body)}
  </>;
}
