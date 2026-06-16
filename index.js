// v7 - full SEMrush data fetch
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

// Raw test endpoint — test any SEMrush endpoint directly
app.get('/raw', async (req, res) => {
  const { domain, key } = req.query;
  if (!domain || !key) return res.json({ error: 'Need domain and key params' });
  try {
    const ovUrl   = `https://api.semrush.com/?type=domain_ranks&key=${key}&export_columns=Dn,Rk,Or,Ot,Ad,At&domain=${domain}&database=us`;
    const blUrl   = `https://api.semrush.com/?type=backlinks_overview&key=${key}&target=${domain}&target_type=root_domain&export_columns=total,domains_num`;
    const spamUrl = `https://api.semrush.com/?type=score&key=${key}&target=${domain}`;
    const [r1,r2,r3] = await Promise.all([fetch(ovUrl),fetch(blUrl),fetch(spamUrl)]);
    const [t1,t2,t3] = await Promise.all([r1.text(),r2.text(),r3.text()]);
    res.json({ overview: t1, backlinks: t2, spam: t3 });
  } catch(e) {
    res.json({ error: e.message });
  }
});

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return {};
  const headers = lines[0].split(';').map(h => h.trim().replace(/\r/g, ''));
  const vals = lines[1].split(';').map(v => v.trim().replace(/\r/g, ''));
  const obj = {};
  headers.forEach((h, i) => obj[h] = vals[i] || '');
  return obj;
}

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
    // Fetch overview (traffic, keywords, rank) + backlinks in parallel
    const ovUrl = `https://api.semrush.com/?type=domain_ranks&key=${semrushKey}&export_columns=Dn,Rk,Or,Ot,Ad,At&domain=${domain}&database=us`;
    const blUrl = `https://api.semrush.com/?type=backlinks_overview&key=${semrushKey}&target=${domain}&target_type=root_domain&export_columns=total,domains_num`;
    const spamUrl = `https://api.semrush.com/?type=score&key=${semrushKey}&target=${domain}`;

    const [ovRes, blRes, spamRes] = await Promise.all([
      fetch(ovUrl),
      fetch(blUrl),
      fetch(spamUrl)
    ]);
    const [ovText, blText, spamText] = await Promise.all([
      ovRes.text(), blRes.text(), spamRes.text()
    ]);

    console.log('OV:', JSON.stringify(ovText.substring(0, 300)));
    console.log('BL:', JSON.stringify(blText.substring(0, 300)));
    console.log('Spam:', JSON.stringify(spamText.substring(0, 300)));

    const ov = parseCSV(ovText);
    const bl = parseCSV(blText);
    const sp = parseCSV(spamText);

    // SEMrush returns full column names
    const rank = parseInt(ov['Rank'] || ov['Rk']) || 0;

    const data = {
      authorityScore:   rank ? Math.min(100, Math.round(100 - (Math.log10(rank) / 7 * 100))) : null,
      organicKeywords:  parseInt(ov['Organic Keywords'] || ov['Or']) || null,
      organicTraffic:   parseInt(ov['Organic Traffic']  || ov['Ot']) || null,
      backlinks:        parseInt(bl['Total']             || bl['total']       || bl['Backlinks']) || null,
      referringDomains: parseInt(bl['Referring Domains'] || bl['domains_num'] || bl['Domains'])  || null,
      spamScore:        parseFloat(sp['Score'] || sp['score']) || null
    };

    console.log('Result:', JSON.stringify(data));
    res.json({ success: true, data, domain });

  } catch (err) {
    console.error('Error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SEMrush proxy v7 on port ${PORT}`));
