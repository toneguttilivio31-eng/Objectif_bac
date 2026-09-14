const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemma-4-26b-a4b-it:free';

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

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return json(405,{error:'Méthode non autorisée'});
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  if(!key) return json(500,{error:"OPENROUTER_API_KEY n'est pas configurée dans Netlify."});

  try{
    const b=JSON.parse(event.body||'{}');
    const prompt=cleanText(b.prompt,70000);
    const customSystem=cleanText(b.system,16000);
    const context=b.context||{};
    const files=Array.isArray(b.files)?b.files.slice(0,10):[];
    const images=Array.isArray(b.images)?b.images.slice(0,8):[];
    if(!prompt && !files.length && !images.length) return json(400,{error:'Aucun contenu à analyser.'});

    const content=[{type:'text',text:prompt || 'Analyse les documents et images fournis.'}];
    for(const f of files){
      if(!f) continue;
      const name=cleanText(f.name,200);
      const text=cleanText(f.text,45000);
      if(text) content.push({type:'text',text:`\n--- DOCUMENT : ${name} ---\n${text}\n--- FIN DOCUMENT ---`});
    }
    for(const im of images){
      if(!im?.data) continue;
      const mime=String(im.type||'image/jpeg');
      if(!mime.startsWith('image/')) continue;
      content.push({type:'image_url',image_url:{url:`data:${mime};base64,${im.data}`}});
    }

    const systemText=[
      "Tu es Objectif Bac AI, assistant scolaire intégré à une application de Terminale générale.",
      'Tu dois analyser réellement les textes et images fournis. Ne prétends jamais avoir lu une information qui n’est pas visible.',
      'Pour les photos de cours, la fidélité au document est prioritaire : ne fabrique ni mot, ni date, ni chiffre, ni nom. Si un passage est illisible, écris [illisible].',
      'Pour les devoirs, aide l’élève sans faire le travail à sa place.',
      'Réponds en français sauf demande contraire.',
      context.currentSubject ? `Matière actuelle : ${cleanText(context.currentSubject,100)}` : '',
      context.currentChapter ? `Chapitre actuel : ${cleanText(context.currentChapter,200)}` : '',
      customSystem
    ].filter(Boolean).join('\n');

    const body={
      model,
      messages:[
        {role:'system',content:systemText},
        {role:'user',content}
      ],
      temperature:0.15,
      max_tokens:8000
    };

    // The selected free model supports structured output. JSON mode makes the
    // course/devoir parsers much more reliable while remaining OpenAI-compatible.
    if(/json/i.test(prompt) || /json/i.test(customSystem)) body.response_format={type:'json_object'};

    const r=await fetch(OPENROUTER_URL,{
      method:'POST',
      headers:{
        'Authorization':`Bearer ${key}`,
        'Content-Type':'application/json',
        'HTTP-Referer':process.env.SITE_URL || 'https://object-if-bac.netlify.app',
        'X-Title':'Objectif Bac'
      },
      body:JSON.stringify(body)
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok){
      const providerMessage=data?.error?.message || data?.error?.metadata?.raw || 'Le fournisseur IA a refusé la requête.';
      return json(r.status,{error:providerMessage,model});
    }
    const answer=data?.choices?.[0]?.message?.content;
    if(!answer) return json(502,{error:'Le modèle IA n’a renvoyé aucune réponse.',model});
    return json(200,{text:answer,model});
  }catch(e){
    console.error('Objectif Bac AI error',e);
    return json(500,{error:e?.message||'Erreur interne de la fonction IA.'});
  }
};
