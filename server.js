require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Anthropic = require('@anthropic-ai/sdk');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const KB = JSON.parse(fs.readFileSync(path.join(__dirname, 'elbasan-knowledge.json'), 'utf8'));

// ── AGENTS ──────────────────────────────────────────────────────────────────
const AGENTS = [
  {
    id: 'ekonomisti', name: 'Artan Dervishi', role: 'Ekonomisti',
    color: '#1a6fb5', bg: '#e8f2fc',
    sys: `Je Artan Dervishi, ekonomist urban. Fol vetëm për temën e debatit. Argumentet e tua: investime strategjike, tërheqje kapitali, kthim financiar i matshëm. Fakte: buxheti bashkisë 3 mld lekë, Autostrada A3. Bie ndesh me Mirelën kur e vë mjedisin mbi ekonominë.`
  },
  {
    id: 'ekolologu', name: 'Mirela Kodra', role: 'Ekolologja',
    color: '#0a7a50', bg: '#e0f5ec',
    sys: `Je Mirela Kodra, ekologe. Fol vetëm për temën e debatit. Argumentet e tua: mjedisi si kusht zhvillimi, 1.5 mln ton mbetje industriale, Operacioni Metalurgjiku 2025, ndotja e Bradasheshit. Kundërshto Artanin kur injoron mjedisin.`
  },
  {
    id: 'historiani', name: 'Prof. Skënder Hoxha', role: 'Historiani',
    color: '#7a4f08', bg: '#fdf0dc',
    sys: `Je Prof. Skënder Hoxha, historian. Fol vetëm për temën e debatit nëpërmjet historisë. Fakte: Scampis romake, Kongresi 1909 (alfabeti shqip), Onufri shek.XVI, Kombinati 1966. Lidhi të kaluarën me të tashmen konkretisht.`
  },
  {
    id: 'qytetarja', name: 'Fatmira Shehu', role: 'Qytetarja',
    color: '#a03318', bg: '#fceae4',
    sys: `Je Fatmira Shehu, nënë e tre fëmijëve, dy punë, burri në Gjermani. Fol vetëm për temën nga përvoja reale. Fjalë të thjeshta dhe direkte. Pyet: "Konkretisht çfarë marrim ne qytetarët?" Mos u devijo nga tema.`
  },
  {
    id: 'avokatja', name: 'Arta Gjiknuri', role: 'Avokatja',
    color: '#3d2ea0', bg: '#eeecfe',
    sys: `Je Arta Gjiknuri, avokate administrative. Fol vetëm për temën e debatit nga prizmi ligjor. Theksoni: transparencën, procedurën, të drejtat e qytetarëve, llogaridhënien institucionale.`
  },
  {
    id: 'moderatori', name: 'Ada Berisha', role: 'Moderatorja',
    color: '#b8922a', bg: '#fdf6e3',
    sys: `Je Ada Berisha, moderatore televizive. Prezanto dhe ndërli debatin. Kur hap debatin: emërto rendin e foljes. Kur bën tranzicion: 1 fjali sintezë, 1 pyetje provokuese. MAKSIMUM 4 fjali gjithsej.`
  }
];

const DEBATE_AGENTS = AGENTS.filter(a => a.id !== 'moderatori');
const MODERATOR = AGENTS.find(a => a.id === 'moderatori');

const CITY_FACTS = `Elbasani: ~206k banorë, qytet i 3-të i Shqipërisë. Buxheti bashkisë ~3 mld lekë. Autostrada A3 (45min nga Tirana). Universiteti Aleksandër Xhuvani, 97 programe. 1.5 mln ton mbetje industriale (ish-Kombinati). Papunësia ~18%. Emigrimi masiv — 48k shqiptarë morën shtetësi BE në 2024. Kongresi 1909 standardizoi alfabetin shqip.`;

const PROVOCATIVE_Q = [
  "Nëse do largoheshit nga Elbasani nesër, cili do ishte arsyeja kryesore?",
  "1.5 milionë ton mbetje industriale — kush mban sot përgjegjësinë?",
  "10 milionë euro për Elbasanin — ku do i investonit saktësisht?",
  "Universiteti ka 97 programe — sa zgjidhim probleme reale të qytetit?",
  "Fëmijët e sotëm të Elbasanit — ku do jenë pas 20 vjetësh?",
  "Buxheti 3 mld lekë — citoni një shpenzim me të cilin nuk bini dakord.",
  "Kombinati prodhoi dy breza punëtorësh — çfarë trashëgoi qyteti?"
];

// ── STATE ────────────────────────────────────────────────────────────────────
let state = { topic: '', round: 0, messages: [], isRunning: false, votes: {} };
let safetyTimer = null;

function setRunning(val) {
  state.isRunning = val;
  if (safetyTimer) clearTimeout(safetyTimer);
  if (val) {
    // Safety: reset after 5 minutes no matter what
    safetyTimer = setTimeout(() => {
      console.log('[SAFETY] isRunning reset by timeout');
      state.isRunning = false;
      io.emit('roundEnd', { round: state.round });
    }, 5 * 60 * 1000);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── SPEAK ────────────────────────────────────────────────────────────────────
async function speak(agentId, userPrompt, phase) {
  const agent = AGENTS.find(a => a.id === agentId);
  if (!agent) return '';

  const msgId = `${agentId}-${Date.now()}`;
  io.emit('speaking', { agentId, start: true, msgId, agentName: agent.name, agentRole: agent.role, agentColor: agent.color });

  // Recent history — max 3 messages, max 150 chars each
  const hist = state.messages.slice(-3)
    .map(m => `${m.agentName}: ${m.text.substring(0, 150)}`)
    .join('\n');

  const isMod = agentId === 'moderatori';
  const maxTok = isMod ? 200 : 1000;

  const systemPrompt = `${agent.sys}

TEMA E DEBATIT: "${state.topic}"
FAKTE ELBASANI: ${CITY_FACTS}
${hist ? `U tha kohët e fundit:\n${hist}` : ''}

RREGULLA ABSOLUTE:
1. Shkruaj VETËM në shqip standard letrare. Asnjë fjalë angleze.
2. Çdo fjali duhet të ketë kryefjalë, kallëzues dhe të jetë e plotë. MOS PRIT FJALI NË MES.
3. Mos u largo asnjëherë nga tema: "${state.topic}".
4. Mos u prezanto me emër. Mos thuaj "Si [roli]...".
5. Përdor fjali të thjeshta dhe të qarta — subject + verb + object.
6. ${isMod ? 'Maksimum 4 fjali të plota.' : `Shkruaj ${phase === 'opening' ? '3 paragrafë' : phase === 'closing' ? '3 paragrafë' : '2 paragrafë'}. Çdo paragraf: 3-4 fjali të plota. Mbaro çdo fjali me pikë.`}
7. Nëse kundërshton dikë, citoje me emër.`;

  let text = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(4000);
    try {
      const stream = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTok,
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      });
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
          const d = chunk.delta.text;
          if (d) { text += d; io.emit('token', { agentId, token: d, msgId }); }
        }
      }
      break;
    } catch (e) {
      console.error(`[${agentId}] attempt ${attempt+1}: ${e.status} ${e.message?.substring(0,60)}`);
      text = '';
    }
  }

  if (text) {
    const msg = { agentId, agentName: agent.name, agentRole: agent.role, agentColor: agent.color, text, phase, msgId, timestamp: Date.now() };
    state.messages.push(msg);
    io.emit('message', msg);
  } else {
    io.emit('token', { agentId, token: `[ ${agent.name} — problem teknik, vazhdon debati ]`, msgId });
  }

  io.emit('speaking', { agentId, start: false, msgId });
  await sleep(1500);
  return text;
}

// ── ROUND ────────────────────────────────────────────────────────────────────
async function runRound(phase) {
  state.round++;
  io.emit('roundStart', { round: state.round, phase });
  console.log(`[Round ${state.round} | ${phase}]`);

  try {
    for (const agent of DEBATE_AGENTS) {
      const recent = state.messages.slice(-3).map(m => `${m.agentName}: ${m.text.substring(0, 120)}`).join('\n');
      const prompt = phase === 'opening'
        ? `Ky është fjalimi yt hapës për temën: "${state.topic}". Çfarë mendon?`
        : phase === 'closing'
        ? `Debati po mbyllet. Fjalimi yt final për temën: "${state.topic}".`
        : `Reagoji atyre që u thanë. Mbaji fokus tek tema: "${state.topic}".\nU tha:\n${recent}`;
      await speak(agent.id, prompt, phase);
    }
  } finally {
    io.emit('roundEnd', { round: state.round });
    setRunning(false);
    console.log(`[Round ${state.round}] done`);
  }
}

// ── ROUTES ───────────────────────────────────────────────────────────────────
app.get('/qr', async (req, res) => {
  const url = `${req.protocol}://${req.get('host')}/audience`;
  const qr = await QRCode.toDataURL(url, { width: 280, margin: 2 });
  res.json({ qr, url });
});
app.get('/audience', (req, res) => res.sendFile(path.join(__dirname, 'public', 'audience.html')));
app.get('/agents', (req, res) => res.json(AGENTS));
app.get('/state', (req, res) => res.json(state));
app.get('/knowledge', (req, res) => res.json(KB));
app.get('/questions', (req, res) => res.json(PROVOCATIVE_Q));

// ── SOCKET ───────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('+', socket.id);
  socket.emit('init', { agents: AGENTS, state, kb: KB });

  socket.on('setTopic', async ({ topic }) => {
    if (state.isRunning) return;
    state = { topic, round: 0, messages: [], isRunning: false, votes: {} };
    io.emit('topicSet', { topic });
    io.emit('clearMessages');
    setRunning(true);

    // Moderator opens
    await speak('moderatori',
      `Hap debatin: tema është "${topic}". Prezanto shkurt dhe njoftoi rendin: Artan (Ekonomisti), Mirela (Ekolologja), Skënder (Historiani), Fatmira (Qytetarja), Arta (Avokatja).`,
      'moderation'
    );
    await runRound('opening');
  });

  socket.on('nextRound', async () => {
    if (state.isRunning || !state.topic) return;
    setRunning(true);
    const phase = state.round >= 2 ? 'closing' : 'debate';
    await runRound(phase);
  });

  socket.on('injectQuestion', async ({ question }) => {
    if (state.isRunning) return;
    setRunning(true);
    io.emit('roundStart', { round: state.round, phase: 'audience' });
    io.emit('injectedQuestion', { question });
    try {
      // Moderator poses it
      await speak('moderatori', `Pyete debatantët: "${question}"`, 'moderation');
      // 2 random agents respond
      const two = [...DEBATE_AGENTS].sort(() => Math.random() - 0.5).slice(0, 2);
      for (const ag of two) {
        await speak(ag.id, `Moderatorja pyeti: "${question}". Mendimi yt lidhur me temën "${state.topic}".`, 'debate');
      }
    } finally {
      setRunning(false);
      io.emit('roundEnd', { round: state.round });
    }
  });

  socket.on('challengeAgent', async ({ challengerId, targetId }) => {
    if (state.isRunning) return;
    const ch = DEBATE_AGENTS.find(a => a.id === challengerId);
    const tg = DEBATE_AGENTS.find(a => a.id === targetId);
    if (!ch || !tg) return;
    setRunning(true);
    io.emit('roundStart', { round: state.round, phase: 'response' });
    io.emit('challenge', { challengerName: ch.name, targetName: tg.name });
    try {
      const last = state.messages.filter(m => m.agentId === targetId).pop();
      await speak(challengerId, `Sfidon ${tg.name} për: "${last?.text?.substring(0, 120) || 'qëndrimin e fundit'}". Kundërshto me argumente.`, 'response');
      await speak(targetId, `${ch.name} të ka sfiduar. Mbroj qëndrimin tënd.`, 'response');
    } finally {
      setRunning(false);
      io.emit('roundEnd', { round: state.round });
    }
  });

  socket.on('audienceQuestion', async ({ question, targetAgent }) => {
    if (state.isRunning) return;
    const tg = DEBATE_AGENTS.find(a => a.id === targetAgent) || DEBATE_AGENTS[0];
    setRunning(true);
    io.emit('roundStart', { round: state.round, phase: 'audience' });
    io.emit('audienceQuestion', { question, targetName: tg.name });
    try {
      await speak(tg.id, `Audienca të pyet: "${question}". Përgjigju konkretisht.`, 'audience');
    } finally {
      setRunning(false);
      io.emit('roundEnd', { round: state.round });
    }
  });

  socket.on('vote', ({ agentId }) => {
    state.votes[agentId] = (state.votes[agentId] || 0) + 1;
    io.emit('voteUpdate', state.votes);
  });

  socket.on('disconnect', () => console.log('-', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
