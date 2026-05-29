require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Groq = require('groq-sdk');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const AGENTS = [
  {
    id: 'ekonomisti',
    name: 'Artan Dervishi',
    role: 'Ekonomisti',
    color: '#1a6fb5',
    bg: '#e8f2fc',
    avatar: 'male_1',
    personality: `Ti je Artan Dervishi, ekonomist i zhvillimit urban me 20 vjet eksperiencë. 
    Flet me fakte dhe shifra. Beson në investime strategjike dhe kthim financiar të matshëm.
    Kundërshton shpenzime pa plan. Shpesh bie ndesh me ekolologun për prioritetet.
    Përgjigjet janë të shkurtra, të mprehta, me argumente ekonomike konkrete. Max 3 fjali.`
  },
  {
    id: 'ekolologu',
    name: 'Mirela Kodra',
    role: 'Ekolologja',
    color: '#0a8a5c',
    bg: '#e0f5ec',
    avatar: 'female_1',
    personality: `Ti je Mirela Kodra, ekologe dhe aktiviste mjedisore. 
    Flet me pasion për klimën dhe gjeneratat e ardhshme. 
    Kundërshton çdo projekt që dëmton mjedisin. Shpesh konfliktohet me ekonomistin.
    Përgjigjet janë emocionale por me baza shkencore. Max 3 fjali.`
  },
  {
    id: 'historiani',
    name: 'Prof. Skënder Hoxha',
    role: 'Historiani',
    color: '#8a5a0a',
    bg: '#fdf0dc',
    avatar: 'male_2',
    personality: `Ti je Prof. Skënder Hoxha, historian dhe albanolog. 
    Çdo vendim e sheh përmes prizmit të historisë dhe identitetit kulturor.
    Citon ngjarje historike të Elbasanit. Kujton traditat dhe vlerat e vjetra.
    Përgjigjet janë poetike dhe me referenca historike. Max 3 fjali.`
  },
  {
    id: 'qytetarja',
    name: 'Fatmira Shehu',
    role: 'Qytetarja',
    color: '#b03a1a',
    bg: '#fceae4',
    avatar: 'female_2',
    personality: `Ti je Fatmira Shehu, nënë e dy fëmijëve, punon dy punë dhe merr autobusin çdo ditë.
    Flet nga përvoja reale e jetës së përditshme. 
    Nuk toleron teori të shkëputura nga realiteti. Pyete: "Po ne qytetarët e thjeshtë çfarë marrim?"
    Përgjigjet janë direkte, ndonjëherë të ashpra, gjithmonë të sinqerta. Max 3 fjali.`
  },
  {
    id: 'avokatja',
    name: 'Arta Gjiknuri',
    role: 'Avokatja',
    color: '#4a38b0',
    bg: '#eeecfe',
    avatar: 'female_3',
    personality: `Ti je Arta Gjiknuri, avokate e të drejtave të njeriut dhe ligjit administrativ.
    Çdo çështje e sheh nga prizmi ligjor dhe i të drejtave qytetare.
    Kujton transparencën, procedurat ligjore dhe llogaridhënien institucionale.
    Përgjigjet janë precize, juridike, por të kuptueshme. Max 3 fjali.`
  }
];

let debateState = {
  topic: '',
  round: 0,
  messages: [],
  isDebating: false,
  currentSpeaker: null,
  audienceVotes: {}
};

app.get('/qr', async (req, res) => {
  const host = req.protocol + '://' + req.get('host');
  const url = `${host}/audience`;
  const qr = await QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: '#1a1a1a', light: '#ffffff' } });
  res.json({ qr, url });
});

app.get('/audience', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'audience.html'));
});

app.get('/agents', (req, res) => res.json(AGENTS));
app.get('/state', (req, res) => res.json(debateState));

async function agentSpeak(agentId, context, trigger) {
  const agent = AGENTS.find(a => a.id === agentId);
  if (!agent) return;

  debateState.currentSpeaker = agentId;
  io.emit('speaking', { agentId, start: true });

  const history = debateState.messages.slice(-6).map(m => ({
    role: 'user',
    content: `${m.agentName}: ${m.text}`
  }));

  const messages = [
    ...history,
    { role: 'user', content: trigger }
  ];

  try {
    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: agent.personality + `\n\nTema e debatit: "${debateState.topic}"\nFol shqip. Mos u prezanto. Përgjigju direkt.` },
        ...messages
      ],
      stream: true,
      max_tokens: 150,
      temperature: 0.85
    });

    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullText += delta;
        io.emit('token', { agentId, token: delta });
      }
    }

    const msg = { agentId, agentName: agent.name, agentRole: agent.role, text: fullText, timestamp: Date.now() };
    debateState.messages.push(msg);
    io.emit('message', msg);

  } catch (e) {
    console.error(e);
  } finally {
    debateState.currentSpeaker = null;
    io.emit('speaking', { agentId, start: false });
  }
}

async function runDebateRound(triggerText) {
  if (debateState.isDebating) return;
  debateState.isDebating = true;
  debateState.round++;
  io.emit('roundStart', { round: debateState.round });

  for (const agent of AGENTS) {
    const lastMessages = debateState.messages.slice(-3).map(m => `${m.agentName}: ${m.text}`).join('\n');
    const context = lastMessages || triggerText;
    const trigger = debateState.round === 1
      ? `Tema për debat: "${debateState.topic}". Çfarë mendon?`
      : `Reagoj ndaj asaj që u tha: ${context}`;
    await agentSpeak(agent.id, context, trigger);
    await new Promise(r => setTimeout(r, 600));
  }

  debateState.isDebating = false;
  io.emit('roundEnd', { round: debateState.round });
}

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);
  socket.emit('init', { agents: AGENTS, state: debateState });

  socket.on('setTopic', async ({ topic }) => {
    debateState = { topic, round: 0, messages: [], isDebating: false, currentSpeaker: null, audienceVotes: {} };
    io.emit('topicSet', { topic });
    await runDebateRound(topic);
  });

  socket.on('nextRound', async () => {
    if (!debateState.isDebating && debateState.topic) {
      await runDebateRound('');
    }
  });

  socket.on('audienceQuestion', async ({ question, targetAgent }) => {
    io.emit('audienceQuestion', { question, targetAgent });
    const agent = targetAgent || AGENTS[Math.floor(Math.random() * AGENTS.length)].id;
    await agentSpeak(agent, debateState.messages.slice(-3).map(m => m.text).join(' '), `Një qytetar nga audienca pyet: "${question}". Përgjigju drejtpërdrejt.`);
  });

  socket.on('vote', ({ agentId }) => {
    debateState.audienceVotes[agentId] = (debateState.audienceVotes[agentId] || 0) + 1;
    io.emit('voteUpdate', debateState.audienceVotes);
  });

  socket.on('disconnect', () => console.log('Disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Parlamenti live: http://localhost:${PORT}`));
