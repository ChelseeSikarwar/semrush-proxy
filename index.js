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
    console.log('OV raw:', ovText.substring(0, 300));
    console.log('BL raw:', blText.substring(0, 300));

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

    console.log('OV parsed:', JSON.stringify(ov));
    console.log('BL parsed:', JSON.stringify(bl));

    // Check for SEMrush API errors
    if (ovText.includes('NOTHING FOUND') || ovText.startsWith('ERROR')) {
      return res.json({ success: false, error: 'SEMrush: ' + ovText.substring(0, 150) });
    }

    const rank = parseInt(ov['Rk']) || 0;

    const data = {
      authorityScore:   rank ? Math.min(100, Math.round(100 - (Math.log10(rank) / 7 * 100))) : null,
      organicKeywords:  parseInt(ov['Or']) || null,
      organicTraffic:   parseInt(ov['Ot']) || null,
      backlinks:        parseInt(bl['total']) || null,
      referringDomains: parseInt(bl['domains_num']) || null
    };

    console.log('Result data:', JSON.stringify(data));

    // Return success as long as we got ANY parseable response — let dashboard handle nulls
    res.json({ success: true, data, domain });

  } catch (err) {
    console.error('Error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SEMrush proxy running on port ${PORT}`));
