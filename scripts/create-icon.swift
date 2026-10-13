import AppKit
let size = 1024
let image = NSImage(size:NSSize(width:size,height:size))
image.lockFocus()
NSGraphicsContext.current?.imageInterpolation = .high
let rect = NSRect(x:0,y:0,width:size,height:size)
NSColor(calibratedRed:0.95,green:0.91,blue:0.84,alpha:1).setFill()
NSBezierPath(roundedRect:rect.insetBy(dx:32,dy:32),xRadius:210,yRadius:210).fill()
let gradient = NSGradient(starting:NSColor(calibratedRed:0.95,green:0.48,blue:0.32,alpha:1),ending:NSColor(calibratedRed:0.85,green:0.32,blue:0.22,alpha:1))!
gradient.draw(in:NSBezierPath(roundedRect:rect.insetBy(dx:74,dy:74),xRadius:175,yRadius:175),angle:270)
let style = NSMutableParagraphStyle(); style.alignment = .center
let font = NSFont(name:"Georgia-BoldItalic",size:740) ?? NSFont.systemFont(ofSize:740,weight:.bold)
("v" as NSString).draw(in:NSRect(x:85,y:93,width:790,height:900),withAttributes:[.font:font,.foregroundColor:NSColor(calibratedRed:1,green:0.96,blue:0.87,alpha:1),.paragraphStyle:style])
let star=NSBezierPath();let center=NSPoint(x:778,y:736)
for i in 0..<8 {let angle = CGFloat(i)*CGFloat.pi/4;let radius:CGFloat = i%2==0 ? 63:16;let p=NSPoint(x:center.x+cos(angle)*radius,y:center.y+sin(angle)*radius);if i==0 {star.move(to:p)} else{star.line(to:p)}}
star.close();NSColor(calibratedRed:1,green:0.82,blue:0.49,alpha:1).setFill();star.fill()
image.unlockFocus()
let rep=NSBitmapImageRep(data:image.tiffRepresentation!)!
let png=rep.representation(using:.png,properties:[:])!
try png.write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
