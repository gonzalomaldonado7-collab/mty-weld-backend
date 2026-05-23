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

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

const uploadToCloudinary = async (filePath) => {
  const result = await cloudinary.uploader.upload(filePath, { folder: 'mty-weld-flyers' });
  return result.secure_url;
};

app.get('/', (req, res) => {
  res.send('MTY Weld Backend OK');
});

async function callAnthropic(prompt, retries = 2) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-haiku-4-5', max_tokens: 800, messages: [{ role: 'user', content: prompt }] },
      { headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    if (retries > 0) return callAnthropic(prompt, retries - 1);
    throw error;
  }
}

app.post('/generate', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Prompt invalido' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key no configurada' });
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

app.post('/generate-flyer', async (req, res) => {
  try {
    const { product_name, price, angle, copy_text } = req.body;
    if (!product_name || !price || !copy_text) return res.status(400).json({ error: 'Missing fields' });

    const id = uuidv4();

    const background = await sharp({
      create: { width: 1080, height: 1080, channels: 4, background: { r: 10, g: 30, b: 63, alpha: 1 } }
    }).png().toBuffer();

    const safeProduct = product_name.replace(/&/g, '&amp;');
    const safeCopy1 = copy_text.slice(0, 80).replace(/&/g, '&amp;');
    const safeCopy2 = copy_text.slice(80, 160).replace(/&/g, '&amp;');
    const safeAngle = angle ? angle.toUpperCase() : '';

    const textSVG = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
      <rect width="1080" height="1080" fill="rgba(0,0,0,0.5)"/>
      <text x="60" y="200" font-size="72" font-weight="bold" fill="white" font-family="Arial">${safeProduct}</text>
      <text x="60" y="310" font-size="80" font-weight="bold" fill="#f5b400" font-family="Arial">$${price} MXN</text>
      <text x="60" y="420" font-size="36" fill="white" font-family="Arial">${safeAngle}</text>
      <text x="60" y="520" font-size="30" fill="#cccccc" font-family="Arial">${safeCopy1}</text>
      <text x="60" y="580" font-size="30" fill="#cccccc" font-family="Arial">${safeCopy2}</text>
      <text x="60" y="900" font-size="32" fill="#f5b400" font-family="Arial">MTY WELD &amp; TOOLS</text>
      <text x="60" y="950" font-size="28" fill="white" font-family="Arial">Monterrey, NL</text>
    </svg>`;

    const textBuffer = Buffer.from(textSVG);
    const finalPath = path.join(OUTPUT_DIR, `${id}-flyer.png`);

    await sharp(background)
      .composite([{ input: textBuffer, top: 0, left: 0 }])
      .png()
      .toFile(finalPath);

    const imageUrl = await uploadToCloudinary(finalPath);
    fs.unlinkSync(finalPath);

    res.json({ ok: true, image_url: imageUrl });
  } catch (error) {
    console.error('ERROR FLYER FULL:', error);
    console.error('STACK:', error?.stack);
    res.status(500).json({ error: error?.message || 'Unknown error', detail: error?.stack });
  }
});
    

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
