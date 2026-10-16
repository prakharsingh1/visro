import {Control,Group,type FabricObject} from 'fabric';

const installed=new WeakSet<Control>();

/** Original rotation glyph. The native control's action and cursor handlers are
 * retained; only its location, hit target and painted affordance change. */
export function installInteractionControls(object:FabricObject):boolean {
  const previous=object.controls?.mtr;
  if(!previous||installed.has(previous)||object.controls.start?.actionName==='modifyLine')return false;
  const rotation=new Control({...previous,x:0,y:.5,offsetX:0,offsetY:40,withConnection:false,sizeX:24,sizeY:24,touchSizeX:32,touchSizeY:32,
    render:(context,left,top)=>{
      context.save();context.translate(left,top);
      context.shadowColor='rgba(0,0,0,.14)';context.shadowBlur=3;context.shadowOffsetY=1;
      context.beginPath();context.arc(0,0,11.5,0,Math.PI*2);context.fillStyle='#ffffff';context.fill();
      context.shadowColor='transparent';context.shadowBlur=0;context.shadowOffsetY=0;context.strokeStyle='#d6d8dc';context.lineWidth=1;context.stroke();
      context.strokeStyle='#0e1318';context.lineWidth=1.5;context.lineCap='round';context.lineJoin='round';
      context.beginPath();context.moveTo(-4,-7);context.bezierCurveTo(-9,-4,-9,4,-4,7);context.moveTo(-7,2);context.lineTo(-4,7);context.lineTo(0,5);
      context.moveTo(4,7);context.bezierCurveTo(9,4,9,-4,4,-7);context.moveTo(7,-2);context.lineTo(4,-7);context.lineTo(0,-5);context.stroke();context.restore();
    },
  });
  installed.add(rotation);object.controls={...object.controls,mtr:rotation};if(object instanceof Group)object.getObjects().forEach(installInteractionControls);object.setCoords();return true;
}
