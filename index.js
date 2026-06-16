const express = require('express');
const fetch = require('node-fetch');
const app = express();

// Allow all origins (CORS)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/', async (req, res) => {
  const { type, domain, semrushKey } = req.query;

  if (type !== 'semrush' || !domain || !semrushKey) {
    return res.json({ success: false, error: 'Missing parameters' });
  }

  try {
    const ovUrl = `https://api.semrush.com/?type=domain_ranks&key=${semrushKey}&export_columns=Dn,Rk,Or,Ot,Ad,At&domain=${domain}&database=us`;
    const blUrl = `https://api.semrush.com/?type=backlinks_overview&key=${semrushKey}&target=${domain}&target_type=root_domain&export_columns=total,domains_num`;

    const [ovRes, blRes] = await Promise.all([fetch(ovUrl), fetch(blUrl)]);
    const [ovText, blText] = await Promise.all([ovRes.text(), blRes.text()]);

    function parseCSV(text) {
      const lines = text.trim().split('\n');
      if (lines.length < 2) return {};
      const headers = lines[0].split(';');
      const vals = lines[1].split(';');
      const obj = {};
      headers.forEach((h, i) => obj[h.trim()] = vals[i] ? vals[i].trim() : '');
      return obj;
    }

    const ov = parseCSV(ovText);
    const bl = parseCSV(blText);

    const rk = parseInt(ov['Rk']) || 0;
    const data = {
      authorityScore:   rk ? Math.min(100, Math.round(100 - (Math.log10(rk) / 7 * 100))) : null,
      organicKeywords:  parseInt(ov['Or']) || null,
      organicTraffic:   parseInt(ov['Ot']) || null,
      backlinks:        parseInt(bl['total']) || null,
      referringDomains: parseInt(bl['domains_num']) || null
    };

    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SEMrush proxy running on port ${PORT}`));
