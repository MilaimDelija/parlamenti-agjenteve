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
KONTEKSTI I QYTETIT TË ELBASANIT (NJOHURI E DETYRUESHME):

HISTORIA: ${KB.historia.themelimi}. ${KB.historia.rilindja}. ${KB.historia.pas_1990}

ÇELIKU: ${KB.industria_dhe_ekonomia.celiku.historia}. ${KB.industria_dhe_ekonomia.celiku.gjendja_sot} ${KB.industria_dhe_ekonomia.celiku.kosto_sociale}

EKONOMIA SOT: Papunësia ${KB.industria_dhe_ekonomia.ekonomia_sot.papunesia}. ${KB.industria_dhe_ekonomia.ekonomia_sot.te_rinjte}. ${KB.industria_dhe_ekonomia.ekonomia_sot.remitancat}

INFRASTRUKTURA: Transporti: ${KB.infrastruktura.transporti.rruga}. ${KB.infrastruktura.transporti.autobusat}. Ujësjellësi: ${KB.infrastruktura.ujesjellesi.problemi}. ${KB.infrastruktura.ujesjellesi.investimi}

MJEDISI: ${KB.mjedisi.ndotja_industriale}. ${KB.mjedisi.lumi_shkumbin}

KULTURA: ${KB.kultura_dhe_trashegimia.kalaja}. ${KB.kultura_dhe_trashegimia.kongresi_1909}

BASHKIA: Buxheti ${KB.bashkia_dhe_politika.buxheti}. Projektet aktive: ${KB.bashkia_dhe_politika.projektet_ne_zbatim.join('; ')}

SFIDAT KRYESORE 2025-2030: ${KB.sfidat_2025_2030.join('; ')}

UNIVERSITETI: ${KB.arsimi.universiteti.emri}, ${KB.arsimi.universiteti.studentet}. ${KB.arsimi.universiteti.sfidat}

NORVEGJIA: ${KB.norvegjia_dhe_bashkepunimi.diaspora}. ${KB.norvegjia_dhe_bashkepunimi.modeli_nordik}
`;

const AGENTS = [
  {
    id: 'ekonomisti',
    name: 'Artan Dervishi',
    role: 'Ekonomisti',
    color: '#1a6fb5',
    bg: '#e8f2fc',
    avatar: 'male_1',
    personality: `Ti je Artan Dervishi, 52 vjeç, ekonomist zhvillimi urban me PhD nga Universiteti i Bolonjës.
Ke punuar 15 vjet në Bankën Botërore dhe tani jeton dhe punon në Elbasan.
Beson fuqimisht në investime strategjike, tërheqje kapitali të huaj dhe reformë institucionale.
Je optimist për të ardhmen e Elbasanit nëse merren vendimet e drejta ekonomike.
Ke shifra konkrete: di buxhetin e bashkisë (3.2 miliardë lekë), papunësinë (18-22%), koston e dekontaminimit të Kombinatit (200+ milionë euro sipas vlerësimeve).
Shpesh bie ndesh me ekologen Mirela — ajo vë mjedisin mbi ekonominë, ti besoj se pa ekonomi të fortë nuk ka as mjedis.
Kundërshtoje me emër kur nuk bie dakord: "Mirela, ajo që thua është ideale por jo realiste..."`
  },
  {
    id: 'ekolologu',
    name: 'Mirela Kodra',
    role: 'Ekolologja',
    color: '#0a8a5c',
    bg: '#e0f5ec',
    avatar: 'female_1',
    personality: `Ti je Mirela Kodra, 44 vjeç, ekologe dhe aktiviste mjedisore nga Elbasani.
Ke studiuar mjedisin e Elbasanit për 20 vjet. Di çdo hollësi: zona e Kombinatit me 400 hektarë tokë të ndotur, nivelet e metaleve të rënda në ujërat nëntokësore, statistikat e kancerit dhe sëmundjeve respiratore mbi mesataren kombëtare.
Je pasionante dhe e drejtpërdrejtë. Kur ekonomisti flet për "zhvillim industrial" ti thuaj se toka është e helmuar dhe fëmijët tanë paguajnë çmimin.
Referoco gjithmonë të dhëna konkrete: "Lumi Shkumbin merr ton ujëra të patrajtuar çdo ditë", "40% e ujit humbet nga tubacionet e vjetra".
Kundërshtoje Artanin me emër kur propozon zgjidhje që injorojnë mjedisin.
Mbështete diasporën norvegjeze si model: Norvegjia ka treguar se ekonomia e gjelbër funksionon.`
  },
  {
    id: 'historiani',
    name: 'Prof. Skënder Hoxha',
    role: 'Historiani',
    color: '#8a5a0a',
    bg: '#fdf0dc',
    avatar: 'male_2',
    personality: `Ti je Prof. Skënder Hoxha, 67 vjeç, historian dhe albanolog, profesor emeritus i Universitetit "Aleksandër Xhuvani" të Elbasanit.
Ke shkruar 12 libra për historinë e Elbasanit. E njeh qytetin si shpellën e tua.
Di çdo datë, çdo ngjarje: themelimin 1466 nga Mehmeti II, Kongresin e Elbasanit 1909 ku u standardizua alfabeti shqip, rolin e Pazarit si qendër tregtare ballkanike, industrializimin komunist dhe çmimin human të tij.
Çdo vendim aktual e sheh nëpërmjet lentës historike. Shpesh mendon se të tjerët po bëjnë të njëjtat gabime si paraardhësit.
Citoje historinë kur është relevante por mos u kthe vetëm në të kaluarën — Elbasani ka nevojë për vizion, jo vetëm kujtesë.
Je pak melankolik por me shpresë. Ke parë qytetin të lulëzojë dhe të bjerë. Beson se mund të ngrihet sërish.`
  },
  {
    id: 'qytetarja',
    name: 'Fatmira Shehu',
    role: 'Qytetarja',
    color: '#b03a1a',
    bg: '#fceae4',
    avatar: 'female_2',
    personality: `Ti je Fatmira Shehu, 38 vjeç, nënë e tre fëmijëve, punon si kamariere dhe pastruse — dy punë për të mbajtur familjen.
Burri jot ka emigruar në Gjermani 5 vjet më parë. Jetoni nga remitancat dhe pagat e tua të ulëta.
Merr autobusin çdo ditë — di si punon (ose nuk punon) transporti publik i Elbasanit.
Fëmijët e tu shkojnë në shkollë me infrastrukturë të vjetër. Ke fqinjë me sëmundje nga ndotja e Kombinatit.
Flet nga përvoja reale, jo nga teoritë. Kur profesori flet për historinë ose ekonomisti për shifrat, ti pyete: "Po unë dhe familja ime konkretisht çfarë marrim?"
Nuk ke frikë të jesh e ashpër: "Kemi dëgjuar shumë premtime. Ne duam vepra."
Shpesh je e frustruar por nuk je cinik — ke ende shpresë, sidomos për fëmijët.
Ndonjëherë thua se po mendon seriozisht të emigrosh — ky është mesazhi më i fuqishëm i krizës demografike.`
  },
  {
    id: 'avokatja',
    name: 'Arta Gjiknuri',
    role: 'Avokatja',
    color: '#4a38b0',
    bg: '#eeecfe',
    avatar: 'female_3',
    personality: `Ti je Arta Gjiknuri, 41 vjeç, avokate e specializuar në të drejtën administrative dhe të drejtat e njeriut.
Ke qenë konsulente ligjore e disa bashkive shqiptare dhe ke punuar me organizata ndërkombëtare për reformën e drejtësisë lokale.
Di ligjin shqiptar të vetëqeverisjes lokale, direktivat evropiane, konventat ndërkombëtare.
Çdo çështje e kalon nëpërmjet filtrit ligjor: a është transparent procesi? A janë konsultuar qytetarët? A ka llogaridhënie?
Ke analizuar buxhetin e bashkisë Elbasan — ke gjetur probleme me prokurimet publike dhe mungesë transparence.
Mbështete modelin norvegjez të e-governance dhe pjesëmarrjes qytetare si standard të arritur.
Ndonjëherë ndesh me Fatmirën — ti flet për procedura ligjore, ajo dëshiron rezultate të shpejta. Duhet t'i shpjegosh se procedurat ligjore mbrojnë pikërisht njerëz si ajo.
Shpesh cito raste konkrete: "Bashkia Elbasan ka humbur tre herë në gjykatë për çështje tokash..."` 
  },
  {
    id: 'moderatori',
    name: 'Ada Berisha',
    role: 'Moderatorja',
    color: '#c9a84c',
    bg: '#fdf6e3',
    avatar: 'female_4',
    personality: `Ti je Ada Berisha, 35 vjeç, gazetare investigative dhe moderatore e njohur televizive nga Tirana.
Ke moderuar dhjetëra debate politike kombëtare. Je e njohur për pyetjet provokuese dhe të drejta.
Detyrë jote: mbaj debatin gjallë, nxirr kontradiktat, bëj pyetje që të tjerët nuk guxojnë.
Prezanto çdo agjent me fjalë të shkurtra goditëse para se të flasin.
Kur debati ngec ose bëhet shumë teknik, ndërhy me një pyetje provokuese për publikun.
Gjenerojë pyetje specifike për çdo agjent bazuar në atë që kanë thënë.
Ndonjëherë citon statistika apo fakte befasuese për të nxitur debat.
Mbaj kohën: pas 2 raundesh bëj sintetizën e pozicioneve dhe pyet publikun të vendosë.
ROLI TEKNIK: Vetëm moderatori e ka këtë rol — ti koordinon, nuk debaton.`
  }
];

const PROVOCATIVE_QUESTIONS = [
  "Nëse nesër do largoheshit nga Elbasani, cili do ishte arsyeja kryesore?",
  "Çeliku i Partisë prodhoi dy gjenerata punëtorësh — kush mban përgjegjësi për atë që lanë pas?",
  "Norvegjia arriti prosperity me naftë — Elbasani çfarë ka si burim të paexploatuar?",
  "Nëse do kishit 10 milionë euro për Elbasanin, ku do i investonit SAKTË?",
  "Fëmijët e sotëm të Elbasanit — ku do jenë pas 20 vjetësh?",
  "Kush e largoi më shumë Elbasanin — komunizmi apo tranzicioni?",
  "A mundet Elbasani të jetë turizëm, teknologji dhe bujqësi — apo duhet të zgjedhë?",
  "Emigrantët elbasanas dërgojnë para — po nëse dërgonin talente, çfarë do ndryshonte?",
  "Universiteti 'Aleksandër Xhuvani' — aktiv i paçmuar apo i humbur?",
  "Bashkia ka 3.2 miliardë lekë buxhet — citoni një shpenzim me të cilin nuk bini dakord."
];

let debateState = {
  topic: '',
  round: 0,
  messages: [],
  isDebating: false,
  currentSpeaker: null,
  audienceVotes: {},
  tensionMatrix: {},
  phase: 'idle'
};

app.get('/qr', async (req, res) => {
  const host = req.protocol + '://' + req.get('host');
  const url = `${host}/audience`;
  const qr = await QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: '#1a1a1a', light: '#ffffff' } });
  res.json({ qr, url });
});

app.get('/audience', (req, res) => res.sendFile(path.join(__dirname, 'public', 'audience.html')));
app.get('/agents', (req, res) => res.json(AGENTS));
app.get('/state', (req, res) => res.json(debateState));
app.get('/questions', (req, res) => res.json(PROVOCATIVE_QUESTIONS));

function updateTension(agentId1, agentId2, level) {
  const key = [agentId1, agentId2].sort().join('-');
  debateState.tensionMatrix[key] = level;
  io.emit('tensionUpdate', debateState.tensionMatrix);
}

async function agentSpeak(agentId, trigger, phase = 'debate') {
  const agent = AGENTS.find(a => a.id === agentId);
  if (!agent) return '';

  debateState.currentSpeaker = agentId;
  const msgId = agentId + '-' + Date.now();
  io.emit('speaking', { agentId, start: true, msgId });

  const recentHistory = debateState.messages.slice(-8).map(m =>
    `[${m.agentRole}] ${m.agentName}: ${m.text}`
  ).join('\n\n');

  const phaseInstructions = {
    'opening': `Ky është FJALIMI HAPËS. Prezanto qartë pozicionin tënd për temën. Jep 2-3 argumente kryesore. Refero gjithmonë realitete konkrete të Elbasanit. Shkruaj 4-6 paragrafë të plotë.`,
    'debate': `Ky është RUNDI I DEBATIT. DETYRIMISHT reago ndaj asaj që kanë thënë të tjerët — cito me emër atë me të cilin nuk bie dakord. Zhvillo argumentin tënd me fakte konkrete. Mund të ndryshohen mendimet bazuar në argumente të forta. Shkruaj 3-5 paragrafë.`,
    'response': `Kjo është KUNDËRPËRGJIGJE. Dikush të ka sfiduar direkt — përgjigju me forcë dhe argumente. Mos u rrëmbe, mos u trego. Shkruaj 3-4 paragrafë të fuqishëm.`,
    'audience': `NJË QYTETAR NGA AUDIENCA KA PYETUR. Kjo është rast i shtuar — fol direkt me publikun, jo me kolegët. Bëj lidhjen me realitetin e përditshëm. Shkruaj 3-4 paragrafë.`,
    'closing': `Ky është FJALIMI MBYLLËS. Sintetizo pozicionin tënd, çfarë ke mësuar nga debati, dhe çfarë do të bëje konkretisht nëse vendimi do ishte yt. Shkruaj 4-5 paragrafë.`
  };

  const systemPrompt = `${agent.personality}

${CITY_CONTEXT}

HISTORIA E DEBATIT DERI TANI:
${recentHistory || 'Debati sapo ka filluar.'}

TEMA E DEBATIT: "${debateState.topic}"

INSTRUKSIONE KRITIKE:
${phaseInstructions[phase] || phaseInstructions['debate']}

- Fol GJITHMONË në shqip
- Mos u prezanto me emër — dihesh kush jesh
- Mos thuaj "Si ekonomist..." — jeto rolin, mos e shpjego
- Refero FAKTE KONKRETE të Elbasanit nga njohuritë e tua
- Nëse dikush ka thënë diçka të gabuar ose jo realiste, kundërshtoje me emër
- Gjuha duhet të jetë e gjallë, njerëzore, me ndjenjë — jo si raport
- Tensioni dhe mosmarrëveshja janë të mira — mos i shmang
- Nëse je Fatmira, fol si dikush që ka humbur diçka — sepse ke humbur
- Nëse je Prof. Skënder, citon historinë vetëm kur ndriçon të tashmen`;

  try {
    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: trigger }
      ],
      stream: true,
      max_tokens: 600,
      temperature: 0.88,
      top_p: 0.95
    });

    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullText += delta;
        io.emit('token', { agentId, token: delta, msgId });
      }
    }

    const msg = {
      agentId,
      agentName: agent.name,
      agentRole: agent.role,
      agentColor: agent.color,
      text: fullText,
      timestamp: Date.now(),
      phase,
      msgId
    };
    debateState.messages.push(msg);
    io.emit('message', msg);

    // Calculate tension with previous speaker
    if (debateState.messages.length >= 2) {
      const prev = debateState.messages[debateState.messages.length - 2];
      if (prev && prev.agentId !== agentId) {
        const tensionWords = ['jo', 'gabim', 'kundër', 'problem', 'nuk', 'por', 'megjithatë', 'absurd', 'i pamundur', 'rrezik'];
        const tensionScore = tensionWords.filter(w => fullText.toLowerCase().includes(w)).length;
        updateTension(agentId, prev.agentId, Math.min(tensionScore, 5));
      }
    }

    return fullText;
  } catch (e) {
    console.error('Agent error:', agentId, e.message);
    io.emit('token', { agentId, token: 'Gabim teknik — duke riprøvuar...', msgId });
    return '';
  } finally {
    debateState.currentSpeaker = null;
    io.emit('speaking', { agentId, start: false, msgId });
  }
}

async function moderatorIntro(topic) {
  return agentSpeak('moderatori', 
    `Hap debatin për temën: "${topic}". Prezanto temën me 2-3 fjali dramatike, pastaj prezanto shkurtimisht (1 fjali secili) të pesë folësit dhe caktoi radhën e fjalës.`,
    'opening'
  );
}

async function moderatorTransition(round) {
  const question = PROVOCATIVE_QUESTIONS[round % PROVOCATIVE_QUESTIONS.length];
  return agentSpeak('moderatori',
    `Rundi ${round} mbaroi. Bëj një sintezë të shkurtër (2 fjali) të tensioneve kryesore, pastaj bëji kësaj pyetjeje provokuese seancës: "${question}"`,
    'debate'
  );
}

async function runDebateRound(phase = 'debate') {
  if (debateState.isDebating) return;
  debateState.isDebating = true;
  debateState.round++;
  debateState.phase = phase;
  io.emit('roundStart', { round: debateState.round, phase });

  const speakingAgents = AGENTS.filter(a => a.id !== 'moderatori');

  for (let i = 0; i < speakingAgents.length; i++) {
    const agent = speakingAgents[i];
    const prevMessages = debateState.messages.slice(-4);
    const prevText = prevMessages.map(m => `${m.agentName}: ${m.text.substring(0, 200)}...`).join('\n');

    let trigger;
    if (phase === 'opening' || debateState.messages.filter(m => m.agentId !== 'moderatori').length === 0) {
      trigger = `Tema e debatit është: "${debateState.topic}". Çfarë mendon ti për këtë?`;
    } else {
      trigger = `Reago ndaj asaj që u tha. Mos harro: je ${agent.name}, ${agent.role}. Çfarë thuaj ti?`;
    }

    await agentSpeak(agent.id, trigger, phase);
    await new Promise(r => setTimeout(r, 800));
  }

  debateState.isDebating = false;
  io.emit('roundEnd', { round: debateState.round });

  // Moderator transition after each round
  if (debateState.round > 0) {
    setTimeout(() => moderatorTransition(debateState.round), 1500);
  }
}

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);
  socket.emit('init', { agents: AGENTS, state: debateState });

  socket.on('setTopic', async ({ topic }) => {
    debateState = {
      topic,
      round: 0,
      messages: [],
      isDebating: false,
      currentSpeaker: null,
      audienceVotes: {},
      tensionMatrix: {},
      phase: 'idle'
    };
    io.emit('topicSet', { topic });
    io.emit('clearMessages');

    // Moderator opens
    await moderatorIntro(topic);
    await new Promise(r => setTimeout(r, 1000));

    // First round - opening statements
    await runDebateRound('opening');
  });

  socket.on('nextRound', async () => {
    if (!debateState.isDebating && debateState.topic) {
      const phase = debateState.round >= 2 ? 'closing' : 'debate';
      await runDebateRound(phase);
    }
  });

  socket.on('audienceQuestion', async ({ question, targetAgent }) => {
    io.emit('audienceQuestion', { question, targetAgent, timestamp: Date.now() });

    const target = targetAgent || AGENTS[Math.floor(Math.random() * (AGENTS.length - 1))].id;
    const agent = AGENTS.find(a => a.id === target);

    if (!debateState.isDebating) {
      debateState.isDebating = true;
      io.emit('roundStart', { round: debateState.round, phase: 'audience' });

      await agentSpeak(
        target,
        `Një qytetar nga audienca të pyet drejtpërdrejt: "${question}". Përgjigju direkt, me njerëzi dhe fakte konkrete.`,
        'audience'
      );

      // One other agent reacts
      const others = AGENTS.filter(a => a.id !== target && a.id !== 'moderatori');
      const reactor = others[Math.floor(Math.random() * others.length)];
      await new Promise(r => setTimeout(r, 600));
      await agentSpeak(
        reactor.id,
        `${agent?.name} u përgjigj pyetjes së audiencës. Ke diçka për të shtuar ose kundërshtuar?`,
        'response'
      );

      debateState.isDebating = false;
      io.emit('roundEnd', { round: debateState.round });
    }
  });

  socket.on('challengeAgent', async ({ challengerId, targetId }) => {
    if (debateState.isDebating) return;
    debateState.isDebating = true;

    const challenger = AGENTS.find(a => a.id === challengerId);
    const target = AGENTS.find(a => a.id === targetId);
    if (!challenger || !target) { debateState.isDebating = false; return; }

    io.emit('challenge', { challengerId, targetId });

    const lastMsg = debateState.messages.filter(m => m.agentId === targetId).pop();
    await agentSpeak(
      challengerId,
      `Sfido ${target.name} direkt për atë që tha: "${lastMsg?.text?.substring(0, 300) || 'pozicionin e tyre'}". Kundërshto me argumente konkrete.`,
      'response'
    );

    await new Promise(r => setTimeout(r, 600));
    await agentSpeak(
      targetId,
      `${challenger.name} të ka sfiduar direkt. Mbrohu me argumente.`,
      'response'
    );

    debateState.isDebating = false;
  });

  socket.on('vote', ({ agentId }) => {
    debateState.audienceVotes[agentId] = (debateState.audienceVotes[agentId] || 0) + 1;
    io.emit('voteUpdate', debateState.audienceVotes);
  });

  socket.on('injectQuestion', async ({ question }) => {
    io.emit('injectedQuestion', { question });
    if (!debateState.isDebating) {
      await agentSpeak('moderatori', `Bëju kësaj pyetjeje të papritur debatit: "${question}"`, 'debate');
    }
  });

  socket.on('disconnect', () => console.log('Disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Parlamenti live: http://localhost:${PORT}`));
