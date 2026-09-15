const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openrouter/free';
const DEFAULT_FALLBACK_MODEL = 'google/gemma-4-31b-it:free';
const DEFAULT_SECOND_FALLBACK_MODEL = 'google/gemma-4-26b-a4b-it:free';

function response(statusCode, body){
  return {statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)};
}

exports.handler = async (event) => {
  if(event.httpMethod !== 'GET') return response(405,{ok:false,error:'Method not allowed'});
  const key=process.env.OPENROUTER_API_KEY;
  if(!key) return response(200,{ok:false,configured:false,provider:'OpenRouter',error:"OPENROUTER_API_KEY n'est pas disponible dans cette Function."});

  const model=process.env.OPENROUTER_MODEL||DEFAULT_MODEL;
  const fallback=process.env.OPENROUTER_FALLBACK_MODEL||DEFAULT_FALLBACK_MODEL;
  const secondFallback=process.env.OPENROUTER_SECOND_FALLBACK_MODEL||DEFAULT_SECOND_FALLBACK_MODEL;
  try{
    const models=[model,fallback,secondFallback].filter((m,i,a)=>m&&a.indexOf(m)===i);
    let last={status:502,data:{}};
    for(const candidate of models){
      const r=await fetch(OPENROUTER_URL,{
        method:'POST',
        headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json','HTTP-Referer':process.env.SITE_URL||'https://objectif-bac.netlify.app','X-Title':'Objectif Bac'},
        body:JSON.stringify({model:candidate,messages:[{role:'user',content:'Réponds uniquement OK.'}],max_tokens:8,temperature:0})
      });
      const data=await r.json().catch(()=>({}));
      last={status:r.status,data};
      if(r.ok) return response(200,{ok:true,configured:true,provider:'OpenRouter',model:data?.model||candidate,fallbackModel:fallback,secondFallbackModel:secondFallback,fallbackUsed:candidate!==model,message:'Connexion IA opérationnelle.'});
    }
    return response(200,{ok:false,configured:true,provider:'OpenRouter',model,fallbackModel:fallback,secondFallbackModel:secondFallback,httpStatus:last.status,error:last.data?.error?.message||last.data?.error?.metadata?.raw||`HTTP ${last.status}`,requestId:last.data?.id||null});
  }catch(e){
    return response(200,{ok:false,configured:true,provider:'OpenRouter',model,fallbackModel:fallback,error:e?.message||'Impossible de joindre OpenRouter.'});
  }
};
