/** Screen-space layout for a continuous document. Scrolling is view state only. */
export interface PageStackLayout {pageWidth:number;pageHeight:number;pitch:number;gap:number;paddingX:number;paddingY:number;contentWidth:number;contentHeight:number;viewportWidth:number;viewportHeight:number;count:number}
export function pageStackLayout(width:number,height:number,zoom:number,viewportWidth:number,viewportHeight:number,count:number):PageStackLayout {
  const pageWidth=Math.max(1,width*zoom),pageHeight=Math.max(1,height*zoom),gap=54;
  // Keep horizontal room on both sides even when a page fits the viewport.
  // Otherwise scrollLeft is locked at zero and pointer-centred zoom cannot
  // preserve an off-centre feature on a narrow page.
  const paddingX=Math.max(48,viewportWidth,(viewportWidth-pageWidth)/2),paddingY=Math.max(64,(viewportHeight-pageHeight)/2);
  return {pageWidth,pageHeight,pitch:pageHeight+gap,gap,paddingX,paddingY,contentWidth:Math.max(viewportWidth,pageWidth+paddingX*2),contentHeight:Math.max(viewportHeight,paddingY*2+Math.max(1,count)*pageHeight+Math.max(0,count-1)*gap),viewportWidth,viewportHeight,count:Math.max(1,count)};
}
export function pageStackPosition(layout:PageStackLayout,index:number,scrollLeft:number,scrollTop:number){return {left:layout.paddingX-scrollLeft,top:layout.paddingY+index*layout.pitch-scrollTop};}
export function visibleStackPage(layout:PageStackLayout,scrollTop:number):number {
  const center=scrollTop+layout.viewportHeight/2-layout.paddingY-layout.pageHeight/2;
  return Math.max(0,Math.min(layout.count-1,Math.round(center/layout.pitch)));
}
export function stackScrollForPage(layout:PageStackLayout,index:number){return Math.max(0,Math.min(layout.contentHeight-layout.viewportHeight,layout.paddingY+index*layout.pitch+(layout.pageHeight-layout.viewportHeight)/2));}

/** Inclusive page range intersecting the viewport, including32px headings and
 * one neighbour by default. At low zoom more than three pages can be visible. */
export function visibleStackRange(layout:PageStackLayout,scrollTop:number,overscan=1):{start:number;end:number} {
  const first=Math.floor((scrollTop-layout.paddingY-layout.pageHeight)/layout.pitch)+1;
  const last=Math.ceil((scrollTop+layout.viewportHeight+32-layout.paddingY)/layout.pitch)-1;
  const extra=Math.max(0,Math.floor(overscan));
  return {start:Math.max(0,Math.min(layout.count-1,first)-extra),end:Math.min(layout.count-1,Math.max(0,last)+extra)};
}

/** Anchor a point to its page, with gap offsets kept in CSS pixels. Scaling an
 * active-page scene coordinate instead would incorrectly scale every54px gap. */
export function stackZoomScroll(previous:PageStackLayout,next:PageStackLayout,scrollLeft:number,scrollTop:number,point:{x:number;y:number}):{left:number;top:number} {
  const x=(scrollLeft+point.x-previous.paddingX)/previous.pageWidth;
  const y=scrollTop+point.y-previous.paddingY;
  const index=Math.max(0,Math.min(previous.count-1,Math.floor(y/previous.pitch)));
  const offset=y-index*previous.pitch;
  const nextOffset=offset<0?offset:offset<=previous.pageHeight?offset/previous.pageHeight*next.pageHeight:next.pageHeight+offset-previous.pageHeight;
  return {
    left:Math.max(0,Math.min(next.contentWidth-next.viewportWidth,next.paddingX+x*next.pageWidth-point.x)),
    top:Math.max(0,Math.min(next.contentHeight-next.viewportHeight,next.paddingY+index*next.pitch+nextOffset-point.y)),
  };
}
