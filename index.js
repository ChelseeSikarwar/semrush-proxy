// v6 - raw response endpoint for debugging
const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Raw test endpoint — returns exact SEMrush response
app.get('/raw', async (req, res) => {
  const { domain, key } = req.query;
  if (!domain || !key) return res.json({ error: 'Need domain and key params' });
  try {
    const url = `https://api.semrush.com/?type=domain_ranks&key=${key}&export_columns=Dn,Rk,Or,Ot&domain=${domain}&database=us`;
    const r = await fetch(url);
    const text = await r.text();
    res.json({ raw: text, status: r.status });
  } catch(e) {
    res.json({ error: e.message });
  }
});

app.get('/', async (req, res) => {
  const { type, domain: rawDomain, semrushKey } = req.query;

  if (type !== 'semrush' || !rawDomain || !semrushKey) {
    return res.json({ success: false, error: 'Missing parameters' });
  }

  const domain = rawDomain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .split('/')[0]
    .trim();

  try {
    const ovUrl = `https://api.semrush.com/?type=domain_ranks&key=${semrushKey}&export_columns=Dn,Rk,Or,Ot,Ad,At&domain=${domain}&database=us`;
    const blUrl = `https://api.semrush.com/?type=backlinks_overview&key=${semrushKey}&target=${domain}&target_type=root_domain&export_columns=total,domains_num`;

    const [ovRes, blRes] = await Promise.all([fetch(ovUrl), fetch(blUrl)]);
    const [ovText, blText] = await Promise.all([ovRes.text(), blRes.text()]);

    console.log('Domain:', domain);
    console.log('OV raw:', JSON.stringify(ovText));
    console.log('BL raw:', JSON.stringify(blText));

    function parseCSV(text) {
      const lines = text.trim().split('\n');
      if (lines.length < 2) return {};
      const headers = lines[0].split(';').map(h => h.trim().replace(/\r/g, ''));
      const vals = lines[1].split(';').map(v => v.trim().replace(/\r/g, ''));
      const obj = {};
      headers.forEach((h, i) => obj[h] = vals[i] || '');
      return obj;
    }

    const ov = parseCSV(ovText);
    const bl = parseCSV(blText);

    const rank = parseInt(ov['Rk']) || 0;

    const data = {
      authorityScore:   rank ? Math.min(100, Math.round(100 - (Math.log10(rank) / 7 * 100))) : null,
      organicKeywords:  ov['Or'] ? parseInt(ov['Or']) : null,
      organicTraffic:   ov['Ot'] ? parseInt(ov['Ot']) : null,
      backlinks:        bl['total'] ? parseInt(bl['total']) : null,
      referringDomains: bl['domains_num'] ? parseInt(bl['domains_num']) : null,
      _raw: { ovText: ovText.substring(0, 200), blText: blText.substring(0, 200) }
    };

    console.log('Result:', JSON.stringify(data));
    res.json({ success: true, data, domain });

  } catch (err) {
    console.error('Error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SEMrush proxy v6 running on port ${PORT}`));
