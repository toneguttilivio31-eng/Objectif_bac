import { getStore } from '@netlify/blobs';

const ALLOWED_KEYS = new Set([
  'weeklyTemplate','weeklyTemplateSeeded','schedule','chapters','courses','homework','todos',
  'errors','grades','energy','subjectSynthesis','homeworkSynthesis','subjectChats','examDates',
  'streak','grandOralQuestions','grandOralAttempts','parcoursupList','weeklyGoals','sharedNotes'
]);

function json(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
}

export default async function handler(req){
  try{
    const store=getStore('mention-shared');
    if(req.method==='GET'){
      const url=new URL(req.url);
      const key=url.searchParams.get('key');
      if(!ALLOWED_KEYS.has(key)) return json({error:'Clé invalide'},400);
      const value=await store.get(key,{type:'json',consistency:'strong'});
      return value===null ? json({value:null},404) : json({value});
    }
    if(req.method==='POST'){
      const body=await req.json();
      if(!ALLOWED_KEYS.has(body?.key)) return json({error:'Clé invalide'},400);
      if(body.value===undefined) return json({error:'Valeur manquante'},400);
      await store.setJSON(body.key,body.value);
      return json({ok:true});
    }
    return json({error:'Méthode non autorisée'},405);
  }catch(error){
    console.error('Mention sync error',error);
    return json({error:'Synchronisation indisponible'},500);
  }
}
