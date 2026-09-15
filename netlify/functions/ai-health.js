const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'openrouter/free';
const DEFAULT_FALLBACK_MODEL = 'google/gemma-4-31b-it:free';
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_MODEL_FALLBACKS=['gemini-3.8-flash','gemini-3.7-flash','gemini-flash-latest'];
function response(statusCode,body){return {statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)}}
exports.handler=async(event)=>{
  if(event.httpMethod!=='GET') return response(405,{ok:false,error:'Method not allowed'});
  const out={ok:false,openrouter:{configured:!!process.env.OPENROUTER_API_KEY},gemini:{configured:!!process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL||DEFAULT_GEMINI_MODEL}};
  try{
    if(process.env.OPENROUTER_API_KEY){
      const model=process.env.OPENROUTER_MODEL||DEFAULT_MODEL, fallback=process.env.OPENROUTER_FALLBACK_MODEL||DEFAULT_FALLBACK_MODEL;
      const r=await fetch(OPENROUTER_URL,{method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENROUTER_API_KEY}`,'Content-Type':'application/json','HTTP-Referer':process.env.SITE_URL||'https://objectif-bac.netlify.app','X-Title':'Objectif Bac'},body:JSON.stringify({models:[model,fallback].filter((m,i,a)=>m&&a.indexOf(m)===i),messages:[{role:'user',content:'Réponds uniquement OK.'}],max_tokens:8})});
      const d=await r.json().catch(()=>({})); out.openrouter={configured:true,ok:r.ok,model:d?.model||model,httpStatus:r.status,error:r.ok?null:(d?.error?.message||`HTTP ${r.status}`)};
    }
    if(process.env.GEMINI_API_KEY){
      const requested=process.env.GEMINI_MODEL||DEFAULT_GEMINI_MODEL;
      const candidates=[requested,...GEMINI_MODEL_FALLBACKS].filter((m,i,a)=>m&&a.indexOf(m)===i);
      out.gemini={configured:true,ok:false,model:requested,httpStatus:null,error:null};
      for(const model of candidates){
        const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),12000);
        try{
          const r=await fetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},body:JSON.stringify({contents:[{parts:[{text:'Réponds uniquement OK.'}]}],generationConfig:{maxOutputTokens:8}}),signal:controller.signal});
          const d=await r.json().catch(()=>({}));
          out.gemini.httpStatus=r.status; out.gemini.error=r.ok?null:(d?.error?.message||`HTTP ${r.status}`);
          if(r.ok){ out.gemini.ok=true; out.gemini.model=d?.modelVersion||model; break; }
        }catch(e){ out.gemini.error=e?.message||'Gemini indisponible'; }
        finally{ clearTimeout(timer); }
      }
    }
    out.ok=!!(out.openrouter.ok||out.gemini.ok); out.message=out.ok?'Au moins un fournisseur IA répond.':'Aucun fournisseur IA ne répond.';
    return response(200,out);
  }catch(e){return response(200,{...out,error:e?.message||'Erreur de diagnostic IA.'});}
};
