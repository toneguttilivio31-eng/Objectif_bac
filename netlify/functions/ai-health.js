exports.handler = async (event) => {
  if(event.httpMethod !== 'GET') return {statusCode:405,headers:{'content-type':'application/json'},body:JSON.stringify({ok:false,error:'Method not allowed'})};
  const configured=!!process.env.OPENROUTER_API_KEY;
  return {statusCode:200,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({ok:configured,configured,provider:'OpenRouter',model:process.env.OPENROUTER_MODEL||'google/gemma-4-26b-a4b-it:free'})};
};
