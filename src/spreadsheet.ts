export function columnLabel(index:number):string {let result="";for(let n=index+1;n>0;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;}
export function evaluateCell(value:string,cells:Record<string,string>,seen=new Set<string>()):string {
  if(!value.startsWith("="))return value;
  const cell=(ref:string):number=>{if(seen.has(ref))throw new Error("cycle");const next=new Set(seen);next.add(ref);const raw=evaluateCell(cells[ref]||"0",cells,next);const number=Number(raw);if(!Number.isFinite(number))throw new Error("value");return number;};
  const range=(s:string)=>{const [a,b]=s.split(":");const parse=(r:string)=>{const match=r.match(/^([A-Z]+)(\d+)$/);if(!match)throw new Error("reference");let col=0;for(const c of match[1])col=col*26+c.charCodeAt(0)-64;return [col-1,Number(match[2])-1];};const [ac,ar]=parse(a),[bc,br]=parse(b||a);if((Math.abs(bc-ac)+1)*(Math.abs(br-ar)+1)>5000)throw new Error("range");const out:number[]=[];for(let r=Math.min(ar,br);r<=Math.max(ar,br);r++)for(let c=Math.min(ac,bc);c<=Math.max(ac,bc);c++)out.push(cell(columnLabel(c)+(r+1)));return out;};
  try {let expression=value.slice(1).toUpperCase().replace(/(SUM|AVERAGE|MIN|MAX|COUNT)\(([^()]+)\)/g,(_m,fn,args)=>{const numbers:number[]=String(args).split(",").flatMap((v:string)=>v.trim().match(/^[A-Z]+\d+(:[A-Z]+\d+)?$/)?range(v.trim()):[Number(v)]);if(numbers.some(n=>!Number.isFinite(n)))throw new Error("value");const sum=numbers.reduce((a,b)=>a+b,0);return String(fn==="SUM"?sum:fn==="AVERAGE"?sum/numbers.length:fn==="MIN"?Math.min(...numbers):fn==="MAX"?Math.max(...numbers):numbers.length);}).replace(/[A-Z]+\d+/g,ref=>String(cell(ref)));
    if(!/^[\d\s.+\-*/()%]+$/.test(expression)||expression.length>500)throw new Error("formula");
    const tokens=expression.match(/\d+(?:\.\d+)?|\.\d+|[()+\-*/%]/g)||[];let i=0;
    const primary=():number=>{const t=tokens[i++];if(t==="-")return -primary();if(t==="+")return primary();if(t==="("){const v=add();if(tokens[i++]!==")")throw new Error("parenthesis");return v;}const n=Number(t);if(t===undefined||!Number.isFinite(n))throw new Error("number");return n;};
    const mul=():number=>{let v=primary();while(["*","/","%"].includes(tokens[i])){const op=tokens[i++],n=primary();v=op==="*"?v*n:op==="/"?v/n:v%n;}return v;};
    const add=():number=>{let v=mul();while(["+","-"].includes(tokens[i])){const op=tokens[i++],n=mul();v=op==="+"?v+n:v-n;}return v;};
    const result=add();if(i!==tokens.length||!Number.isFinite(result))throw new Error("invalid");return String(Math.round(result*1e8)/1e8);
  }catch{return "#ERROR!";}
}

export function parseCSV(text:string):string[][] {
  if(text.length>4*1024*1024)throw new Error("Choose a CSV smaller than 4 MB.");
  const rows:string[][]=[];let row:string[]=[],value="",quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else if(quoted||value.length===0)quoted=!quoted;else value+=c;}
    else if(!quoted&&c===','){row.push(value);value="";}
    else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);rows.push(row);row=[];value="";}
    else value+=c;
  }
  if(quoted)throw new Error("The CSV contains an unclosed quote.");
  if(value.length||row.length){row.push(value);rows.push(row);}
  if(rows[0]?.[0])rows[0][0]=rows[0][0].replace(/^\uFEFF/,"");
  return rows;
}
