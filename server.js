require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Groq = require('groq-sdk');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const KB = JSON.parse(fs.readFileSync(path.join(__dirname, 'elbasan-knowledge.json'), 'utf8'));

const CITY_CONTEXT = `
KONTEKSTI I QYTETIT TË ELBASANIT (NJOHURI E DETYRUESHME — BURIME ZYRTARE: elbasani.gov.al, INSTAT, euronews.al, reporter.al):

QYTETI: ${KB.qyteti.titujt}. ${KB.qyteti.pozita}. Popullsia e bashkisë sipas Regjistrit Civil: ${KB.qyteti.popullsia.bashkia_regjistri_civil}. Zona urbane: ${KB.qyteti.popullsia.qyteti_urban}.

HISTORIA: ${KB.historia.lashtesia}. ${KB.historia.periudha_osmane}. ${KB.historia.rilindja_kombetare}. ${KB.historia.pas_1990}

KOMBINATI METALURGJIK: ${KB.kombinati_metalurgjik.ndertimi}. ${KB.kombinati_metalurgjik.privatizimi}. ${KB.kombinati_metalurgjik.gjendja_2024}. ${KB.kombinati_metalurgjik.ndotja_sot}. ${KB.kombinati_metalurgjik.kosto_humane}

EKONOMIA: ${KB.industria_dhe_ekonomia.ekonomia_sot.sektoret}. ${KB.industria_dhe_ekonomia.remitancat}

INFRASTRUKTURA: ${KB.infrastruktura.transporti.autostrada}. ${KB.infrastruktura.transporti.autobusat_urban}. ${KB.infrastruktura.kanalizimi}

MJEDISI: ${KB.mjedisi.ndotja_kombinat}. ${KB.mjedisi.balezi}

KULTURA: ${KB.kultura_dhe_trashegimia.kalaja}. ${KB.kultura_dhe_trashegimia.onufri}. ${KB.kultura_dhe_trashegimia.gastronomia}

BASHKIA: ${KB.bashkia_dhe_politika.buxheti}. Projekte: ${KB.bashkia_dhe_politika.projektet_ne_zbatim.join('; ')}.

UNIVERSITETI: ${KB.arsimi.universiteti.emri}. ${KB.arsimi.universiteti.regjistrimet_2024_2025}. ${KB.arsimi.universiteti.nderkombetarizimi}.

DIASPORA (E SAKTË): ${KB.diaspora.konteksti_kombetar}. ${KB.diaspora.destinacionet_kryesore}. ${KB.diaspora.per_elbasanin}

NORVEGJIA: ${KB.norvegjia_bashkepunimi.konteksti_i_sakte}. ${KB.norvegjia_bashkepunimi.modeli_nordik}

SFIDAT: ${KB.sfidat_2025_2030.join('; ')}
`;

// ─── AGJENTËT ───────────────────────────────────────────────────────────────
const DEBATE_AGENTS = [
  {
    id: 'ekonomisti', name: 'Artan Dervishi', role: 'Ekonomisti',
    color: '#1a6fb5', bg: '#e8f2fc', seat: 0,
    personality: `Je Artan Dervishi, 52 vjeç, ekonomist zhvillimi urban me doktoraturë nga Universiteti i Bolonjës. Ke punuar 15 vjet në Bankën Botërore dhe tani jeton e punon në Elbasan. Beson në investime strategjike, tërheqje kapitali dhe reformë institucionale. Je optimist për Elbasanin nëse merren vendimet e duhura. Di shifra konkrete: buxheti i bashkisë, papunësia, kostot e dekontaminimit. Bie shpesh ndesh me ekologen Mirela — ajo vë mjedisin mbi gjithçka, ti beson se pa ekonomi të fortë nuk ka as mjedis. Kur nuk bie dakord e thua haptas: "Mirela, ajo që thua është ideale por jo e realizueshme tani..."
RREGULLA GJUHE: Fol shqip standard, fjali të plota dhe të qarta. Mos përdor fjalë angleze. Mos u prezanto me emër. Mos thuaj "Si ekonomist..." — jeto rolin, mos e shpjego. Përgjigju gjithmonë DREJTPËRDREJT temës dhe asaj që tha folësi i fundit.`
  },
  {
    id: 'ekolologu', name: 'Mirela Kodra', role: 'Ekolologja',
    color: '#0a7a50', bg: '#e0f5ec', seat: 1,
    personality: `Je Mirela Kodra, 44 vjeç, ekologe dhe aktiviste mjedisore nga Elbasani. Ke studiuar mjedisin e Elbasanit për 20 vjet. Di çdo hollësi: mbi 1.5 milionë ton mbetje industriale në zonën e ish-Kombinatit, ndotja e ujërave nëntokësore, problemet shëndetësore të banorëve të Bradasheshit. Je pasionante dhe e drejtpërdrejtë. Kur ekonomisti flet për "zhvillim pa kufizime" i thua: "Artan, kemi 1.5 milionë ton mbetje — kjo është trashëgimia jonë industriale." Mbështet modelet nordike të ekonomisë së gjelbër.
RREGULLA GJUHE: Fol shqip standard, fjali të plota dhe të qarta. Mos përdor fjalë angleze. Mos u prezanto. Mos thuaj "Si ekologe..." Cito gjithmonë fakte konkrete nga realiteti i Elbasanit.`
  },
  {
    id: 'historiani', name: 'Prof. Skënder Hoxha', role: 'Historiani',
    color: '#7a4f08', bg: '#fdf0dc', seat: 2,
    personality: `Je Prof. Skënder Hoxha, 67 vjeç, historian dhe albanolog, profesor emeritus i Universitetit "Aleksandër Xhuvani" të Elbasanit. Ke shkruar 12 libra për historinë e qytetit. E njeh çdo ngjarje: themelimin e qytetit si Skampa romake, Kongresin e Elbasanit 1909 ku u standardizua alfabeti shqip, Onufrin e Elbasanit — piktotin e madh të shekullit XVI, industrializimin komunist dhe çmimin e tij. Çdo vendim aktual e sheh nëpërmjet historisë. Je paksa melankolik por me shpresë. Beson se Elbasani mund të ngrihet sërish.
RREGULLA GJUHE: Fol shqip standard dhe letrar, fjali të plota. Mos u prezanto. Mos thuaj "Si historian..." Refero ngjarje historike vetëm kur ndriçojnë të tashmen konkrete.`
  },
  {
    id: 'qytetarja', name: 'Fatmira Shehu', role: 'Qytetarja',
    color: '#a03318', bg: '#fceae4', seat: 3,
    personality: `Je Fatmira Shehu, 38 vjeç, nënë e tre fëmijëve, punon si kamariere dhe pastruse — dy punë për të mbajtur familjen. Burri yt ka emigruar në Gjermani 5 vjet më parë. Jetoni nga remitancat dhe paga jote. Merr autobusin çdo ditë — e di si funksionon ose nuk funksionon transporti. Fëmijët tënë shkojnë në shkollë me probleme infrastrukture. Ke fqinjë me sëmundje frymëmarrjeje nga ndotja e zonës industriale. Flet nga jeta reale, jo nga teoritë. Kur të tjerët bëhen shumë teknikë pyet: "E gjithë kjo është mirë, por unë dhe fëmijët e mi çfarë marrim konkretisht?" Ndonjëherë thua se po mendon seriozisht të emigrosh — ky është mesazhi më i fortë i krizës.
RREGULLA GJUHE: Fol shqip të thjeshtë dhe të drejtpërdrejtë, siç flet njeriu i zakonshëm. Mos u prezanto. Mos thuaj "Si qytetare..." Fjali të shkurtra, konkrete, njerëzore.`
  },
  {
    id: 'avokatja', name: 'Arta Gjiknuri', role: 'Avokatja',
    color: '#3d2ea0', bg: '#eeecfe', seat: 4,
    personality: `Je Arta Gjiknuri, 41 vjeç, avokate e specializuar në të drejtën administrative dhe të drejtat e njeriut. Ke qenë konsulente ligjore e disa bashkive dhe ke punuar me organizata ndërkombëtare për reformën e drejtësisë lokale. Çdo çështje e kalon nëpërmjet filtrit ligjor: transparenca e procesit, konsultimi me qytetarët, llogaridhënia institucionale. Ke analizuar buxhetin e bashkisë Elbasan dhe ke gjetur probleme me prokurimin publik. Mbështet modelin nordik të e-governance. Ndonjëherë bie ndesh me Fatmirën — ti flet për procedura, ajo dëshiron rezultate. Duhet t'i shpjegosh: "Fatmira, procedurat ligjore mbrojnë pikërisht njerëz si ty."
RREGULLA GJUHE: Fol shqip standard dhe juridik, por të kuptueshëm. Mos u prezanto. Mos thuaj "Si avokate..." Cito të drejta konkrete dhe precedentë realistë.`
  }
];

const MODERATOR = {
  id: 'moderatori', name: 'Ada Berisha', role: 'Moderatorja',
  color: '#b8922a', bg: '#fdf6e3', seat: 5,
  personality: `Je Ada Berisha, 35 vjeç, gazetare investigative dhe moderatore televizive. Ke moderuar dhjetëra debate politike. Je e njohur për pyetje provokuese dhe të drejta.
FUNKSIONET E TUAT:
1. HAPJA: Prezanto temën me 2-3 fjali dramatike. Pastaj njoftoje SAKTËSISHT rendin e foljes: "Do flasë fillimisht Artan Dervishi — Ekonomisti, pastaj Mirela Kodra — Ekolologja, pastaj Prof. Skënder Hoxha — Historiani, pastaj Fatmira Shehu — Qytetarja, dhe së fundi Arta Gjiknuri — Avokatja."
2. TRANZICIONI: Pas çdo rundi bëj sintezën e dy tensioneve kryesore (2 fjali) dhe bëj një pyetje të re provokuese për të gjithë.
3. PYETJA E AUDIENCËS: Kur dikush nga publiku pyet, thirr me emër agjentin e adresuar dhe pyete të përgjigjet.
RREGULLA GJUHE: Fol shqip standard dhe profesional, fjali të plota. Mos u prezanto. Mos thuaj "Si moderatore..." Gjuha duhet të jetë televizive dhe dinamike.`
};

const PROVOCATIVE_QUESTIONS = [
  "Nëse do të largoheshit nga Elbasani nesër, cili do të ishte arsyeja kryesore?",
  "Çeliku i Partisë prodhoi dy breza punëtorësh — kush mban sot përgjegjësinë për 1.5 milionë ton mbetje?",
  "Norvegjia arriti mirëqenien me naftë — Elbasani çfarë burimi të paexploatuar ka?",
  "Nëse do kishit 10 milionë euro për Elbasanin, ku do i investonit saktësisht?",
  "Fëmijët e sotëm të Elbasanit — ku do jenë pas 20 vjetësh?",
  "Kongresi i Elbasanit 1909 standardizoi alfabetin shqip — çfarë do të standardizonte Kongresi i 2026?",
  "Universiteti 'Aleksandër Xhuvani' ka 97 programe studimi — sa prej tyre zgjidhim një problem real të qytetit?",
  "48,000 shqiptarë morën shtetësi të huaj në 2024 — si e ndjen Elbasani këtë shifër?",
  "Bashkia ka buxhet 3 miliardë lekë — citoni një shpenzim me të cilin nuk bini dakord.",
  "Çfarë ka mësuar Elbasani nga rënia e Kombinatit që nuk do ta përsërisë kurrë?"
];

// ─── STATE ──────────────────────────────────────────────────────────────────
let state = {
  topic: '', round: 0, messages: [],
  isRunning: false, currentSpeaker: null,
  votes: {}, phase: 'idle'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Personalitete të shkurtuara për të kursyer tokens
const SHORT_PERSONA = {
  ekonomisti: `Je Artan Dervishi, ekonomist urban. Beson në investime strategjike dhe kthim financiar. Ke shifra: buxheti bashkisë 3 mld lekë, papunësia ~18%. Kundërshton Mirelën kur vë mjedisin mbi gjithçka.`,
  ekolologu:  `Je Mirela Kodra, ekologe. Di: 1.5 mln ton mbetje industriale, KURUM ndaloi 2024, Operacioni Metalurgjiku 2025. Kundërshton Artanin kur injoron mjedisin.`,
  historiani: `Je Prof. Skënder Hoxha, historian. Elbasani: Scampis romake, Kongresi 1909, Onufri shek.XVI, Kombinati 1966. Çdo vendim e sheh historikisht.`,
  qytetarja:  `Je Fatmira Shehu, nënë 3 fëmijësh, dy punë, burri në Gjermani. Flet nga jeta e përditshme. Pyet: "Ne qytetarët çfarë marrim konkretisht?"`,
  avokatja:   `Je Arta Gjiknuri, avokate e drejtës administrative. Vë transparencën, procedurën ligjore dhe llogaridhënien mbi gjithçka.`,
  moderatori: `Je Ada Berisha, moderatore televizive. Prezanto, ndërli, bëj pyetje provokuese. Maksimum 3 fjali.`
};

// ─── AGENT SPEAK — me exponential backoff dhe fallback model ────────────────
async function agentSpeak(agentId, trigger, phase) {
  const agent = agentId === 'moderatori'
    ? MODERATOR
    : DEBATE_AGENTS.find(a => a.id === agentId);
  if (!agent) return '';

  const msgId = `${agentId}-${Date.now()}`;
  state.currentSpeaker = agentId;
  io.emit('speaking', { agentId, start: true, msgId, agentName: agent.name, agentRole: agent.role, agentColor: agent.color });

  const history = state.messages.slice(-4)
    .map(m => `${m.agentName}: ${m.text.substring(0, 80)}`)
    .join('\n');

  const persona = SHORT_PERSONA[agentId] || agent.personality.substring(0, 200);

  const instruksion = {
    moderation: 'Modero: 2-3 fjali.',
    opening:    'Fjalim hapës: qëndrimi yt + 2 argumente me fakte nga Elbasani. 2 paragrafë.',
    closing:    'Fjalim mbyllës: sinteza + propozim. 2 paragrafë.',
    audience:   'Foli publikut drejtpërdrejt. 2 paragrafë.',
    response:   'Kundërpërgjigje: mbroje qëndrimin. 2 paragrafë.',
    debate:     'Reago ndaj çfarë u tha. Cito me emër. 2 paragrafë.'
  }[phase] || 'Reago ndaj çfarë u tha. 2 paragrafë.';

  const sysPrompt = `${persona}

Tema: "${state.topic}"
${history ? 'U tha: ' + history : ''}

${instruksion}
Fol VETËM shqip. Fjali të plota. Mos u prezanto. Mos thuaj "Si [roli]...".`;

  const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
  let fullText = '';

  for (let attempt = 0; attempt < 3; attempt++) {
    const model = attempt < 2 ? MODELS[0] : MODELS[1]; // fallback te 8b në tentativën 3
    const waitMs = attempt === 0 ? 0 : attempt === 1 ? 3000 : 6000;
    if (waitMs > 0) {
      console.log(`[${agentId}] waiting ${waitMs}ms before attempt ${attempt+1}...`);
      await sleep(waitMs);
    }

    try {
      const stream = await groq.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: trigger }
        ],
        stream: true,
        max_tokens: phase === 'moderation' ? 150 : 350,
        temperature: 0.78
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          io.emit('token', { agentId, token: delta, msgId });
        }
      }
      console.log(`[${agentId}] OK (attempt ${attempt+1}, model: ${model})`);
      break;

    } catch (err) {
      const status = err.status || err.statusCode || '?';
      console.error(`[${agentId}] attempt ${attempt+1} failed: status=${status} ${err.message?.substring(0,60)}`);
      fullText = '';
    }
  }

  if (fullText) {
    const msg = { agentId, agentName: agent.name, agentRole: agent.role, agentColor: agent.color, text: fullText, phase, msgId, timestamp: Date.now() };
    state.messages.push(msg);
    io.emit('message', msg);
  } else {
    const errMsg = `[ ${agent.name} nuk u përgjigj — problema teknike ]`;
    io.emit('token', { agentId, token: errMsg, msgId });
  }

  state.currentSpeaker = null;
  io.emit('speaking', { agentId, start: false, msgId });
  await sleep(1500); // 1.5s mes agjentëve — kjo parandalon rate limiting
  return fullText;
}

// ─── DEBATE ORCHESTRATION ────────────────────────────────────────────────────
async function runFullRound(phase) {
  state.round++;
  state.phase = phase;
  io.emit('roundStart', { round: state.round, phase });
  console.log(`[Round ${state.round}] Phase: ${phase}`);

  for (let i = 0; i < DEBATE_AGENTS.length; i++) {
    const agent = DEBATE_AGENTS[i];
    const prev = state.messages.slice(-3).map(m => `${m.agentName}: ${m.text.substring(0, 120)}`).join('\n');

    const trigger = phase === 'opening'
      ? `Tema: "${state.topic}". Fjalimi yt hapës.`
      : phase === 'closing'
      ? `Tema: "${state.topic}". Fjalimi yt mbyllës.`
      : `Reagoji çfarë u tha:\n${prev}\n\nMerr qëndrimin tënd.`;

    await agentSpeak(agent.id, trigger, phase);
  }

  io.emit('roundEnd', { round: state.round });
  state.isRunning = false;
  console.log(`[Round ${state.round}] Completed.`);

  await sleep(2000);
  const q = PROVOCATIVE_QUESTIONS[state.round % PROVOCATIVE_QUESTIONS.length];
  await agentSpeak('moderatori',
    `Rundi ${state.round} mbaroi. Sintezë e shkurtër (1 fjali) + pyetje: "${q}"`,
    'moderation'
  );
}

// ─── ROUTES ─────────────────────────────────────────────────────────────────
app.get('/qr', async (req, res) => {
  const host = req.protocol + '://' + req.get('host');
  const url = `${host}/audience`;
  const qr = await QRCode.toDataURL(url, { width: 280, margin: 2, color: { dark: '#1a1a1a', light: '#ffffff' } });
  res.json({ qr, url });
});
app.get('/audience', (req, res) => res.sendFile(path.join(__dirname, 'public', 'audience.html')));
app.get('/agents', (req, res) => res.json([...DEBATE_AGENTS, MODERATOR]));
app.get('/state', (req, res) => res.json(state));
app.get('/knowledge', (req, res) => res.json(KB));
app.get('/questions', (req, res) => res.json(PROVOCATIVE_QUESTIONS));

// ─── SOCKET ──────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('Connected:', socket.id);
  socket.emit('init', { agents: [...DEBATE_AGENTS, MODERATOR], state, kb: KB });

  socket.on('setTopic', async ({ topic }) => {
    if (state.isRunning) return;
    state = { topic, round: 0, messages: [], isRunning: true, currentSpeaker: null, votes: {}, phase: 'intro' };
    io.emit('topicSet', { topic });
    io.emit('clearMessages');

    // Moderatori hap
    await agentSpeak('moderatori',
      `Hap debatin për temën: "${topic}". Prezantoje temën me 2-3 fjali dramatike. Pastaj njoftoje rendin e saktë të foljes: Artan Dervishi (Ekonomisti), Mirela Kodra (Ekolologja), Prof. Skënder Hoxha (Historiani), Fatmira Shehu (Qytetarja), Arta Gjiknuri (Avokatja). Thuaju se secilit do i jepet fjala sipas kësaj radhe.`,
      'moderation'
    );

    await sleep(800);
    await runFullRound('opening');
  });

  socket.on('nextRound', async () => {
    if (state.isRunning || !state.topic) return;
    state.isRunning = true;
    const phase = state.round >= 2 ? 'closing' : 'debate';
    await runFullRound(phase);
  });

  socket.on('audienceQuestion', async ({ question, targetAgent }) => {
    if (state.isRunning) return;
    state.isRunning = true;
    io.emit('roundStart', { round: state.round, phase: 'audience' });

    const target = DEBATE_AGENTS.find(a => a.id === targetAgent) || DEBATE_AGENTS[Math.floor(Math.random() * DEBATE_AGENTS.length)];
    io.emit('audienceQuestion', { question, targetAgent: target.id, targetName: target.name });

    await agentSpeak(target.id,
      `Një qytetar nga audienca të pyet: "${question}". Përgjigju qartë me fakte konkrete.`,
      'audience'
    );

    const reactor = DEBATE_AGENTS.filter(a => a.id !== target.id)[Math.floor(Math.random() * 4)];
    await agentSpeak(reactor.id,
      `${target.name} u përgjigj pyetjes së audiencës. Ke diçka për të shtuar?`,
      'debate'
    );

    state.isRunning = false;
    io.emit('roundEnd', { round: state.round });
  });

  socket.on('challengeAgent', async ({ challengerId, targetId }) => {
    if (state.isRunning) return;
    state.isRunning = true;

    const challenger = DEBATE_AGENTS.find(a => a.id === challengerId);
    const target = DEBATE_AGENTS.find(a => a.id === targetId);
    if (!challenger || !target) { state.isRunning = false; return; }

    io.emit('roundStart', { round: state.round, phase: 'response' });
    io.emit('challenge', { challengerId, targetId, challengerName: challenger.name, targetName: target.name });

    const lastMsg = state.messages.filter(m => m.agentId === targetId).pop();
    await agentSpeak(challengerId,
      `Sfidon ${target.name}: "${lastMsg?.text?.substring(0, 150) || 'qëndrimin e tyre'}". Kundërshto me argumente.`,
      'response'
    );
    await agentSpeak(targetId,
      `${challenger.name} të ka sfiduar. Mbroj qëndrimin tënd.`,
      'response'
    );

    state.isRunning = false;
    io.emit('roundEnd', { round: state.round });
  });

  socket.on('vote', ({ agentId }) => {
    state.votes[agentId] = (state.votes[agentId] || 0) + 1;
    io.emit('voteUpdate', state.votes);
  });

  socket.on('injectQuestion', async ({ question }) => {
    if (state.isRunning) return;
    state.isRunning = true;
    io.emit('roundStart', { round: state.round, phase: 'moderation' });
    io.emit('injectedQuestion', { question });

    // Moderatori bën pyetjen, pastaj dy agjentë reagojnë
    await agentSpeak('moderatori',
      `Pyetje e re për debatantët: "${question}"`,
      'moderation'
    );

    const shuffled = [...DEBATE_AGENTS].sort(() => Math.random() - 0.5).slice(0, 2);
    for (const ag of shuffled) {
      await agentSpeak(ag.id,
        `Moderatorja bëri pyetjen: "${question}". Çfarë mendon ti?`,
        'debate'
      );
    }

    state.isRunning = false;
    io.emit('roundEnd', { round: state.round });
  });

  socket.on('disconnect', () => console.log('Disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Parlamenti: http://localhost:${PORT}`));
