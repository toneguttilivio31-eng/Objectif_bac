exports.handler = async (event) => {
  const out=(s,b)=>({statusCode:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},body:JSON.stringify(b)});
  if(event.httpMethod!=="POST") return out(405,{error:"Méthode non autorisée"});
  try{
    const b=JSON.parse(event.body||"{}");
    const name=String(b.name||"document");
    const type=String(b.type||"");
    const data=String(b.data||"").replace(/^data:[^;]+;base64,/,"");
    if(!data) return out(400,{error:"Document vide"});
    const buf=Buffer.from(data,"base64");
    const ext=(name.split(".").pop()||"").toLowerCase();

    if(["txt","md","csv","json","xml"].includes(ext) || type.startsWith("text/")){
      return out(200,{name,text:buf.toString("utf8").slice(0,100000)});
    }

    if(ext==="pdf" || type==="application/pdf"){
      try{
        const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
        const doc=await pdfjs.getDocument({data:buf}).promise;
        let text="";
        for(let p=1;p<=Math.min(doc.numPages,40);p++){
          const page=await doc.getPage(p);
          const tc=await page.getTextContent();
          text+=tc.items.map(x=>x.str).join(" ")+"\\n";
          if(text.length>100000) break;
        }
        return out(200,{name,text:text.slice(0,100000)});
      }catch(e){
        return out(422,{error:"PDF reçu mais son texte n'a pas pu être extrait. Tu peux envoyer ses pages en photos.",detail:e.message});
      }
    }

    if(ext==="docx"){
      try{
        const mammoth=require("mammoth");
        const r=await mammoth.extractRawText({buffer:buf});
        return out(200,{name,text:r.value.slice(0,100000)});
      }catch(e){
        return out(422,{error:"DOCX reçu mais le module d'extraction n'est pas installé. Envoie le document en PDF ou en photos.",detail:e.message});
      }
    }

    return out(422,{error:"Format non pris en charge pour l'extraction. Utilise PDF, DOCX, TXT, Markdown ou une photo."});
  }catch(e){return out(500,{error:e.message||"Erreur extraction"});}
};
