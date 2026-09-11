exports.handler = async (event) => {
  const json = (statusCode, body) => ({
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  });

  if (event.httpMethod !== "POST") return json(405, {error:"Méthode non autorisée"});
  const key = process.env.AI_API_KEY;
  const base = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/,"");
  const model = process.env.AI_MODEL || "gpt-4o-mini";

  if (!key) return json(500, {error:"AI_API_KEY n'est pas configurée dans Netlify."});

  try {
    const b = JSON.parse(event.body || "{}");
    const prompt = String(b.prompt || "").slice(0, 60000);
    const customSystem = String(b.system || "").slice(0, 12000);
    const context = b.context || {};
    const files = Array.isArray(b.files) ? b.files.slice(0, 10) : [];
    const images = Array.isArray(b.images) ? b.images.slice(0, 8) : [];

    const content = [{type:"text", text:prompt}];

    for (const f of files) {
      if (!f) continue;
      const name = String(f.name || "document");
      const text = String(f.text || "");
      if (text) content.push({
        type:"text",
        text:`\n--- DOCUMENT : ${name} ---\n${text.slice(0,40000)}\n--- FIN DOCUMENT ---`
      });
    }

    for (const im of images) {
      if (!im?.data) continue;
      const mime = String(im.type || "image/jpeg");
      if (!mime.startsWith("image/")) continue;
      content.push({
        type:"image_url",
        image_url:{url:`data:${mime};base64,${im.data}`}
      });
    }

    const systemText = [
      `Tu es Mention AI, l'assistant scolaire intégré à une application destinée à une élève de Terminale générale.`,
      `Matières possibles : HGGSP, SES, Histoire-Géographie, Philosophie, Anglais, Espagnol, SVT, Physique-Chimie, EMC, EPS.`,
      `Tu dois être fiable, clair et pédagogique. Analyse réellement les textes et images fournis.`,
      `Ne prétends jamais avoir lu une information qui n'est pas visible.`,
      `Pour un cours : identifie les notions, structure le contenu, résume et peux générer fiche, flashcards et questions.`,
      `Pour un devoir : comprends la consigne, explique ce qui est demandé, aide à organiser le travail et signale les éléments importants.`,
      `Réponds en français sauf demande contraire. N'invente ni date, ni citation, ni information absente du document.`,
      customSystem ? `Consigne spécifique de cette action : ${customSystem}` : '',
      context.currentSubject ? `Matière actuelle : ${context.currentSubject}` : '',
      context.currentChapter ? `Chapitre actuel : ${context.currentChapter}` : ''
    ].filter(Boolean).join('\n');

    const r = await fetch(`${base}/chat/completions`, {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${key}`
      },
      body:JSON.stringify({
        model,
        messages:[
          {
            role:"system",
            content:
`Tu es Mention AI, l'assistant scolaire intégré à une application destinée à une élève de Terminale générale.
Matières possibles : HGGSP, SES, Histoire-Géographie, Philosophie, Anglais, Espagnol, SVT, Physique-Chimie, EMC, EPS.
Tu dois être fiable, clair et pédagogique. Analyse réellement les textes et images fournis.
Ne prétends jamais avoir lu une information qui n'est pas visible.
Pour un cours : identifie les notions, structure le contenu, résume et peux générer fiche, flashcards et questions.
Pour un devoir : comprends la consigne, explique ce qui est demandé, aide à organiser le travail et signale les éléments importants.
Réponds en français sauf demande contraire.
N'invente ni date, ni citation, ni information absente du document.`
          },
          {role:"user", content}
        ],
        temperature:0.2
      })
    });

    const data = await r.json().catch(()=>({}));
    if (!r.ok) return json(r.status, {
      error:data?.error?.message || "Le fournisseur IA a refusé la requête."
    });

    const answer = data?.choices?.[0]?.message?.content;
    if (!answer) return json(502,{error:"Le modèle IA n'a renvoyé aucune réponse."});

    return json(200,{text:answer, model});
  } catch (e) {
    return json(500,{error:e?.message || "Erreur interne de la fonction IA."});
  }
};
