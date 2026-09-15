const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openrouter/free';
const DEFAULT_FALLBACK_MODEL = 'google/gemma-4-31b-it:free';
const DEFAULT_SECOND_FALLBACK_MODEL = 'google/gemma-4-26b-a4b-it:free';

function json(statusCode, body){
  return {
    statusCode,
    headers: {
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store'
    },
    body:JSON.stringify(body)
  };
}

function cleanText(value, max=60000){
  return String(value || '').slice(0,max);
}

function getErrorDetails(data, status){
  const e = data?.error;
  if(!e) return `Erreur OpenRouter HTTP ${status}.`;
  const parts=[];
  if(e.message) parts.push(String(e.message));
  if(e.code) parts.push(`code ${e.code}`);
  const raw=e?.metadata?.raw;
  if(raw && raw !== e.message){
    const rawText=typeof raw==='string' ? raw : JSON.stringify(raw);
    if(rawText) parts.push(rawText.slice(0,1200));
  }
  return parts.join(' — ') || `Erreur OpenRouter HTTP ${status}.`;
}

async function callOpenRouter({key, body}){
  const response = await fetch(OPENROUTER_URL,{
    method:'POST',
    headers:{
      'Authorization':`Bearer ${key}`,
      'Content-Type':'application/json',
      'HTTP-Referer':process.env.SITE_URL || 'https://objectif-bac.netlify.app',
      'X-Title':'Objectif Bac'
    },
    body:JSON.stringify(body)
  });
  const data=await response.json().catch(()=>({}));
  return {response,data};
}

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return json(405,{error:'Méthode non autorisée'});

  const key = process.env.OPENROUTER_API_KEY;
  if(!key) return json(500,{error:"OPENROUTER_API_KEY n'est pas configurée dans Netlify.",stage:'configuration'});

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const fallback = process.env.OPENROUTER_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL;
  const secondFallback = process.env.OPENROUTER_SECOND_FALLBACK_MODEL || DEFAULT_SECOND_FALLBACK_MODEL;

  try{
    const b=JSON.parse(event.body||'{}');
    const prompt=cleanText(b.prompt,50000);
    const customSystem=cleanText(b.system,16000);
    const context=b.context||{};
    const files=Array.isArray(b.files)?b.files.slice(0,6):[];
    const images=Array.isArray(b.images)?b.images.slice(0,8):[];
    const incomingMessages=Array.isArray(b.messages)?b.messages.slice(-12):[];
    if(!prompt && !files.length && !images.length && !incomingMessages.length) return json(400,{error:'Aucun contenu à analyser.'});

    const systemText=[
      "Tu es Objectif Bac AI, l'assistant scolaire intégré à toute l'application Objectif Bac.",
      'Tu peux aider pour les cours, révisions, devoirs, emploi du temps, notes, Bac, Grand oral, Parcoursup, langues, méthodologie, organisation et questions générales.',
      'Tu dois analyser réellement les textes et images fournis. Ne prétends jamais avoir lu une information qui n’est pas visible.',
      'Pour les photos de cours et copies, la fidélité au document est prioritaire : ne fabrique ni mot, ni date, ni chiffre, ni nom. Si un passage est illisible, écris [illisible].',
      'Pour les devoirs et corrections, aide l’élève sans faire le travail à sa place.',
      'Réponds en français sauf demande contraire.',
      context.currentSubject ? `Matière actuelle : ${cleanText(context.currentSubject,100)}` : '',
      context.currentChapter ? `Chapitre actuel : ${cleanText(context.currentChapter,200)}` : '',
      customSystem
    ].filter(Boolean).join('\n');

    const content=[{type:'text',text:prompt || 'Analyse les documents et images fournis.'}];
    for(const f of files){
      if(!f) continue;
      const name=cleanText(f.name,200);
      const text=cleanText(f.text,30000);
      if(text) content.push({type:'text',text:`\n--- DOCUMENT : ${name} ---\n${text}\n--- FIN DOCUMENT ---`});
    }
    for(const im of images){
      if(!im?.data) continue;
      const mime=String(im.type||'image/jpeg');
      if(!mime.startsWith('image/')) continue;
      content.push({type:'image_url',image_url:{url:`data:${mime};base64,${im.data}`}});
    }

    let messages;
    if(incomingMessages.length){
      messages=incomingMessages.map((m,i)=>{
        const role=m?.role==='assistant'?'assistant':'user';
        const raw=m?.content ?? m?.text ?? '';
        return {role,content:cleanText(raw,9000)};
      }).filter(m=>m.content);
      if(!messages.length) messages=[{role:'user',content}];
      else if(files.length || images.length){
        const last=messages.length-1;
        const lastContent=[{type:'text',text:messages[last].content}];
        for(const f of files){
          const name=cleanText(f?.name,200), text=cleanText(f?.text,30000);
          if(text) lastContent.push({type:'text',text:`\n--- DOCUMENT : ${name} ---\n${text}\n--- FIN DOCUMENT ---`});
        }
        for(const im of images){
          if(im?.data && String(im.type||'image/jpeg').startsWith('image/')) lastContent.push({type:'image_url',image_url:{url:`data:${im.type||'image/jpeg'};base64,${im.data}`}});
        }
        messages[last]={...messages[last],content:lastContent};
      }
    }else{
      messages=[{role:'user',content}];
    }

    const body={
      models:[model, fallback, secondFallback].filter((m,i,a)=>m && a.indexOf(m)===i),
      messages:[{role:'system',content:systemText},...messages],
      temperature:0.15,
      max_tokens:Math.min(Math.max(Number(b.maxTokens)||5000,500),6000)
    };

    let result=await callOpenRouter({key,body});
    let data=result.data;
    let r=result.response;

    // If the router still returns an error, make one explicit second attempt on
    // the known-good free multimodal backup. This protects us from a provider
    // returning an error before OpenRouter's model fallback can be applied.
    const explicitFallbacks=[fallback, secondFallback].filter((m,i,a)=>m && m!==model && a.indexOf(m)===i);
    for(const backupModel of explicitFallbacks){
      if(r.ok) break;
      const backupBody={...body, model:backupModel, models:[backupModel]};
      result=await callOpenRouter({key,body:backupBody});
      data=result.data;
      r=result.response;
      if(r.ok){
        const answer=data?.choices?.[0]?.message?.content;
        if(answer) return json(200,{text:answer,model:data?.model||backupModel,fallbackUsed:true});
      }
    }

    if(!r.ok){
      return json(r.status >= 400 ? r.status : 502,{
        error:getErrorDetails(data,r.status),
        stage:'openrouter',
        httpStatus:r.status,
        model,
        fallbackModel:fallback,
        secondFallbackModel:secondFallback,
        fallbackTried:true,
        requestId:data?.id || null
      });
    }

    const answer=data?.choices?.[0]?.message?.content;
    if(!answer) return json(502,{error:'Le modèle IA n’a renvoyé aucune réponse.',stage:'openrouter',model:data?.model||model});
    return json(200,{text:answer,model:data?.model||model,fallbackUsed:data?.model===fallback});
  }catch(e){
    console.error('Objectif Bac AI error',e);
    return json(500,{error:e?.message||'Erreur interne de la fonction IA.',stage:'function'});
  }
};
