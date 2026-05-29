# Parlamenti i Agjentëve
### Java e Demokracisë · Elbasan 2026

Sistem debati live me 5 agjentë AI, avatarë me pamje njerëzish, 
dhe komunikim real-time me audiencën përmes QR kodi.

---

## Instalimi lokal

```bash
npm install
cp .env.example .env
# Vendos GROQ_API_KEY në .env
npm start
```

Hap http://localhost:3000 në browser.

---

## Deploy në Render.com

1. Ngarko projektin në GitHub (repo private)
2. Shko te render.com → New Web Service
3. Lidh repo-n
4. Build Command: `npm install`
5. Start Command: `node server.js`
6. Environment Variables: `GROQ_API_KEY=xxx`
7. Deploy

Render jep URL publike — kjo shkon në QR kod automatikisht.

---

## Si funksionon

**Ekrani i madh (index.html)**
- Projektohet në sallë
- Vendos temën e debatit
- Shikon avatarët live duke folur
- QR kodi shfaqet për audiencën

**Telefoni i audiencës (audience.html)**
- Skanojnë QR kodin
- Pyesin agjentët direkt
- Votojnë kë kanë bindur

**Agjentët (server.js)**
- Artan Dervishi — Ekonomisti
- Mirela Kodra — Ekolologja  
- Prof. Skënder Hoxha — Historiani
- Fatmira Shehu — Qytetarja
- Arta Gjiknuri — Avokatja

---

## Groq API

Modeli: llama-3.3-70b-versatile
Çmim: falas deri 14,400 kërkesa/ditë
Latenca: ~0.5s për token të parë (streaming live)
