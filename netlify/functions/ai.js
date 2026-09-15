const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'google/gemma-4-26b-a4b-it:free';
const DEFAULT_FALLBACK_MODEL = 'google/gemma-4-31b-it:free';
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_MODEL_FALLBACKS = ['gemini-3.8-flash','gemini-3.7-flash','gemini-flash-latest'];

function json(statusCode, body){
  return {
    statusCode,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},
    body:JSON.stringify(body)
  };
}
function cleanText(value,max=60000){ return String(value||'').slice(0,max); }
function getOpenRouterError(data,status){
  const e=data?.error; if(!e) return `Erreur OpenRouter HTTP ${status}.`;
  const parts=[]; if(e.message) parts.push(String(e.message)); if(e.code) parts.push(`code ${e.code}`);
  const raw=e?.metadata?.raw; if(raw && raw!==e.message){ const t=typeof raw==='string'?raw:JSON.stringify(raw); if(t) parts.push(t.slice(0,1200)); }
  return parts.join(' — ') || `Erreur OpenRouter HTTP ${status}.`;
}
function getGeminiError(data,status){
  const msg=data?.error?.message || data?.error?.status || data?.error?.code;
  return msg ? `Erreur Gemini HTTP ${status} : ${msg}` : `Erreur Gemini HTTP ${status}.`;
}
async function callOpenRouter({key,body}){
  const response=await fetch(OPENROUTER_URL,{method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json','HTTP-Referer':process.env.SITE_URL||'https://objectif-bac.netlify.app','X-Title':'Objectif Bac'},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({})); return {response,data};
}
async function callGemini({key,model,contents,system,maxOutputTokens=5000}){
  const url=`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`;
  const body={contents};
  if(system) body.systemInstruction={parts:[{text:system}]};
  body.generationConfig={temperature:0.15,maxOutputTokens};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),45000);
  try{
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body),signal:controller.signal});
    const data=await response.json().catch(()=>({})); return {response,data};
  }catch(error){
    const status=error?.name==='AbortError'?504:502;
    return {response:{ok:false,status},data:{error:{message:error?.message||'Gemini indisponible'}}};
  }finally{ clearTimeout(timer); }
}
async function callGeminiWithFallback({key,model,contents,system,maxOutputTokens=5000}){
  const candidates=[model,...GEMINI_MODEL_FALLBACKS].filter((m,i,a)=>m&&a.indexOf(m)===i);
  let last=null;
  for(const candidate of candidates){
    const result=await callGemini({key,model:candidate,contents,system,maxOutputTokens});
    last={...result,model:candidate};
    if(result.response.ok){
      const answer=geminiText(result.data);
      if(answer) return {...result,model:candidate,answer};
    }
  }
  return last||{response:{ok:false,status:502},data:{},model};
}
function geminiText(data){
  return (data?.candidates||[]).flatMap(c=>c?.content?.parts||[]).map(p=>p?.text||'').join('').trim();
}
function normalizeMessages(messages){
  return (Array.isArray(messages)?messages.slice(-12):[]).map(m=>({role:m?.role==='assistant'?'model':'user',parts:[{text:cleanText(m?.content??m?.text??'',12000)}]})).filter(m=>m.parts[0].text);
}

exports.handler=async(event)=>{
  if(event.httpMethod!=='POST') return json(405,{error:'Méthode non autorisée'});
  try{
    const b=JSON.parse(event.body||'{}');
    const prompt=cleanText(b.prompt,50000);
    const customSystem=cleanText(b.system,16000);
    const context=b.context||{};
    const files=Array.isArray(b.files)?b.files.slice(0,8):[];
    const images=Array.isArray(b.images)?b.images.slice(0,6):[];
    const incomingMessages=Array.isArray(b.messages)?b.messages.slice(-12):[];
    if(!prompt && !files.length && !images.length && !incomingMessages.length) return json(400,{error:'Aucun contenu à analyser.'});

    const systemText=[
      "Tu es Objectif Bac AI, l'assistant scolaire intégré à toute l'application Objectif Bac.",
      'Tu peux aider pour les cours, révisions, devoirs, emploi du temps, notes, Bac, Grand oral, Parcoursup, langues, méthodologie, organisation et questions générales.',
      'Analyse réellement les textes et images fournis. Ne prétends jamais avoir lu une information qui n’est pas visible.',
      'Pour les photos de cours et copies, la fidélité au document est prioritaire : ne fabrique ni mot, ni date, ni chiffre, ni nom. Si un passage est illisible, écris [illisible].',
      'Pour les devoirs et corrections, aide l’élève sans faire le travail à sa place.',
      'Réponds en français sauf demande contraire.',
      context.currentSubject?`Matière actuelle : ${cleanText(context.currentSubject,100)}`:'',
      context.currentChapter?`Chapitre actuel : ${cleanText(context.currentChapter,200)}`:'',
      customSystem
    ].filter(Boolean).join('\n');

    const textBlocks=files.map(f=>{ const text=cleanText(f?.text,20000); return text?`\n--- DOCUMENT : ${cleanText(f?.name,200)} ---\n${text}\n--- FIN DOCUMENT ---`:''; }).join('');
    const userText=(prompt||'Analyse les documents et images fournis.')+textBlocks;

    const geminiKey=process.env.GEMINI_API_KEY;
    const geminiModel=process.env.GEMINI_MODEL||DEFAULT_GEMINI_MODEL;
    const openKey=process.env.OPENROUTER_API_KEY;
    const model=process.env.OPENROUTER_MODEL||DEFAULT_MODEL;
    const fallback=process.env.OPENROUTER_FALLBACK_MODEL||DEFAULT_FALLBACK_MODEL;

    // Images go to Gemini first. Gemini's native multimodal endpoint is used
    // directly so the photo never has to be converted into a fake text hint.
    if(images.length && geminiKey){
      const parts=[{text:userText}];
      for(const im of images){
        if(!im?.data) continue;
        const mime=String(im.type||'image/jpeg');
        if(!mime.startsWith('image/')) continue;
        const data=String(im.data);
        if(data.length>6500000) return json(413,{error:'Une photo est trop lourde. Choisis une photo plus légère.',stage:'input'});
        parts.push({inlineData:{mimeType:mime,data}});
      }
      if(parts.length>1){
        const gr=await callGeminiWithFallback({key:geminiKey,model:geminiModel,contents:[{role:'user',parts}],system:systemText,maxOutputTokens:Math.min(Math.max(Number(b.maxTokens)||4200,800),6000)});
        if(gr.response.ok && gr.answer){
          return json(200,{text:gr.answer,provider:'gemini',model:gr.data?.modelVersion||gr.model});
        }
        // Fall through to OpenRouter if Gemini is unavailable/quota-limited.
        if(!openKey) return json(gr.response.status>=400?gr.response.status:502,{error:getGeminiError(gr.data,gr.response.status),stage:'gemini',model:gr.model||geminiModel});
      }
    }

    // If OpenRouter is not configured, Gemini can still handle ordinary text/chat requests.
    if(!openKey && geminiKey){
      const contents=incomingMessages.length ? incomingMessages.map(m=>({role:m?.role==='assistant'?'model':'user',parts:[{text:cleanText(m?.content??m?.text??'',12000)}]})).filter(m=>m.parts[0].text) : [{role:'user',parts:[{text:userText}]}];
      const gr=await callGeminiWithFallback({key:geminiKey,model:geminiModel,contents,system:systemText,maxOutputTokens:Math.min(Math.max(Number(b.maxTokens)||2800,500),6000)});
      if(gr.response.ok && gr.answer) return json(200,{text:gr.answer,provider:'gemini',model:gr.data?.modelVersion||gr.model});
      return json(gr.response.status>=400?gr.response.status:502,{error:getGeminiError(gr.data,gr.response.status),stage:'gemini',model:gr.model||geminiModel});
    }
    if(!openKey) return json(500,{error:"Aucune clé IA n'est configurée dans Netlify. Ajoute OPENROUTER_API_KEY ou GEMINI_API_KEY.",stage:'configuration'});
    const content=[{type:'text',text:userText}];
    for(const im of images){
      if(!im?.data) continue; const mime=String(im.type||'image/jpeg'); if(!mime.startsWith('image/')) continue;
      const data=String(im.data); if(data.length>1900000) return json(413,{error:'Une photo est encore trop lourde après compression.',stage:'input'});
      content.push({type:'image_url',image_url:{url:`data:${mime};base64,${data}`}});
    }
    let messages;
    if(incomingMessages.length && !images.length && !files.length){
      messages=normalizeMessages(incomingMessages);
      if(!messages.length) messages=[{role:'user',content}];
    }else messages=[{role:'user',content}];
    const body={models:[model,fallback].filter((m,i,a)=>m&&a.indexOf(m)===i),messages:[{role:'system',content:systemText},...messages],temperature:0.15,max_tokens:Math.min(Math.max(Number(b.maxTokens)||2800,500),5000)};
    let result=await callOpenRouter({key:openKey,body}); let data=result.data,r=result.response;
    if(!r.ok && fallback && fallback!==model){
      result=await callOpenRouter({key:openKey,body:{...body,model:fallback,models:[fallback]}}); data=result.data; r=result.response;
    }
    if(!r.ok) return json(r.status>=400?r.status:502,{error:getOpenRouterError(data,r.status),stage:'openrouter',httpStatus:r.status,model,fallbackModel:fallback,requestId:data?.id||null});
    const rawAnswer=data?.choices?.[0]?.message?.content;
    const answer=Array.isArray(rawAnswer)?rawAnswer.map(x=>typeof x==='string'?x:(x?.text||'')).join('').trim():String(rawAnswer||'').trim();
    if(!answer) return json(502,{error:'Le modèle IA n’a renvoyé aucune réponse.',stage:'openrouter',model:data?.model||model});
    return json(200,{text:answer,provider:'openrouter',model:data?.model||model});
  }catch(e){
    console.error('Objectif Bac AI error',e);
    return json(500,{error:e?.message||'Erreur interne de la fonction IA.',stage:'function'});
  }
};
