require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Output folder
const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// Upload to Cloudinary
const uploadToCloudinary = async (filePath) => {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: 'mty-weld-flyers',
  });
  return result.secure_url;
};

// ── ENDPOINT: health check
app.get('/', (req, res) => {
  res.send('MTY Weld Backend OK');
});

// ── ENDPOINT: generate text ads
async function callAnthropic(prompt, retries = 2) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5',
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
    return res.status(500).json({ error: 'API key no configurada' });
  }
  try {
    const data = await callAnthropic(prompt);
    const text = data.content.filter(x => x.type === 'text').map(x => x.text).join('').trim();
    let parsed = null;
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) parsed = JSON.parse(text.slice(start, end + 1));
    } catch (e) {}
    res.json({ ok: true, raw: text, parsed });
  } catch (error) {
    res.status(500).json({ error: 'Error en generacion', detail: error.response?.data || error.message });
  }
});

// ── ENDPOINT: generate flyer (Mock Visual Engine)
app.post('/generate-flyer', async (req, res) => {
  try {
    const { product_name, price, angle, copy_text } = req.body;
    if (!product_name || !price || !copy_text) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const id = uuidv4();

    // 1. FONDO MOCK — gradiente oscuro industrial
    const background = await sharp({
      create: {
        width: 1080,
        height: 1080,
        channels: 4,
        background: { r: 10, g: 30, b: 63, alpha: 1 }
      }
    }).png().toBuffer();

    // 2. CAPA DE TEXTO SVG
    const textSVG = `
    <svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
      <rect width="1080" height="1080" fill="rgba(0,0,0,0.5)"/>
      <text x="60" y="200" font-size="72" font-weight="bold" fill="white" font-family="Arial">${product_name}</text>
      <text x="60" y="310" font-size="80" font-weight="bold" fill="#f5b400" font-family="Arial">$${price} MXN</text>
      <text x="60" y="420" font-size="36" fill="white" font-family="Arial">${angle.toUpperCase()}</text>
      <text x="60" y="520" font-size="30" fill="#cccccc" font-family="Arial">${copy_text.slice(0, 80)}</text>
