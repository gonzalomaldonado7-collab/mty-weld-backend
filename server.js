const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('MTY Weld Backend OK');
});

app.post('/generate', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt invalido' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', data);
      return res.status(500).json({ error: 'Error en API de IA', detail: data });
    }

    const text = data.content
      ?.filter(x => x.type === 'text')
      .map(x => x.text)
      .join('') || '';

    let parsed = null;
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        parsed = JSON.parse(text.slice(start, end + 1));
      }
    } catch (e) {
      console.warn('No se pudo parsear JSON');
    }

    res.json({ ok: true, raw: text, parsed });

  } catch (error) {
    console.error('ERROR REAL:', error);
    if (error.name === 'AbortError') {
      return res.status(500).json({ error: 'Timeout de la API' });
    }
    res.status(500).json({ error: 'Error interno del servidor', detail: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
