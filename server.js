const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('MTY Weld Backend OK');
});

async function callAnthropic(prompt, retries = 2) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        timeout: 15000
      }
    );
    return response.data;
  } catch (error) {
    console.error('ERROR ANTHROPIC:', error.response?.data || error.message);
    if (retries > 0) {
      console.log('Reintentando...');
      return callAnthropic(prompt, retries - 1);
    }
    throw error;
  }
}

app.post('/generate', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt invalido' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('API KEY NO DEFINIDA');
    return res.status(500).json({ error: 'API key no configurada' });
  }

  console.log('API KEY presente:', process.env.ANTHROPIC_API_KEY.slice(0, 10) + '...');

  try {
    const data = await callAnthropic(prompt);

    const text = data.content
      .filter(x => x.type === 'text')
      .map(x => x.text)
      .join('').trim();

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
    console.error('ERROR FINAL:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Error en generacion',
      detail: error.response?.data || error.message
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
