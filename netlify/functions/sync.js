import { getStore } from '@netlify/blobs';

const ALLOWED_KEYS = new Set([
  'weeklyTemplate','weeklyTemplateSeeded','schedule','chapters','courses','homework','todos',
  'errors','grades','energy','subjectSynthesis','homeworkSynthesis','subjectChats','examDates',
  'streak','grandOralQuestions','grandOralAttempts','parcoursupList','weeklyGoals','sharedNotes','bacSimulation'
]);

function json(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
}

function mergeRecords(existing,incoming){
  if(!Array.isArray(existing) || !Array.isArray(incoming)) return incoming;
  const map=new Map();
  for(const item of existing){ if(item && item.id) map.set(String(item.id),item); }
  for(const item of incoming){
    if(!item || !item.id){ continue; }
    const id=String(item.id);
    const old=map.get(id);
    // New records are appended; records with the same id are updated by the latest client.
    map.set(id, old ? {...old,...item} : item);
  }
  return Array.from(map.values());
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
      const key=body.key;
      const incoming=body.value;
      const existing=await store.get(key,{type:'json',consistency:'strong'});
      let value=incoming;
      if(Array.isArray(existing) && Array.isArray(incoming)) value=mergeRecords(existing,incoming);
      await store.setJSON(key,value);
      return json({ok:true,value});
    }
    return json({error:'Méthode non autorisée'},405);
  }catch(error){
    console.error('Objectif Bac sync error',error);
    return json({error:'Synchronisation indisponible'},500);
  }
}
