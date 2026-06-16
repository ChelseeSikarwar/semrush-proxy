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

  const domain = rawDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').split('/')[0].trim();

  try {
    const ovUrl = `https://api.semrush.com/?type=domain_ranks&key=${semrushKey}&export_columns=Dn,Rk,Or,Ot,Ad,At&domain=${domain}&database=us`;
    const blUrl = `https://api.semrush.com/?type=backlinks_overview&key=${semrushKey}&target=${domain}&target_type=root_domain&export_columns=total,domains_num`;

    const [ovRes, blRes] = await Promise.all([fetch(ovUrl), fetch(blUrl)]);
    const [ovText, blText] = await Promise.all([ovRes.text(), blRes.text()]);

    console.log('OV raw:', ovText.substring(0, 300));
    console.log('BL raw:', blText.substring(0, 300));

    function parseCSV(text) {
      const lines = text.trim().split('\n');
      if (lines.length < 2) return {};
      const headers = lines[0].split(';').map(h => h.trim().replace(/\r/g,''));
      const vals    = lines[1].split(';').map(v => v.trim().replace(/\r/g,''));
      const obj = {};
      headers.forEach((h, i) => obj[h] = vals[i] || '');
      console.log('Headers:', headers);
      console.log('Vals:', vals);
      return obj;
    }

    const ov = parseCSV(ovText);
    const bl = parseCSV(blText);

    // SEMrush domain_ranks columns: Dn=domain, Rk=rank, Or=organic keywords, Ot=organic traffic
    const rank           = parseInt(ov['Rk']) || 0;
    const organicKw      = parseInt(ov['Or']) || null;
    const organicTraffic = parseInt(ov['Ot']) || null;
    const backlinks      = parseInt(bl['total']) || null;
    const refDomains     = parseInt(bl['domains_num']) || null;

    // Authority score: derived from SEMrush rank (lower rank = higher authority)
    const authorityScore = rank ? Math.min(100, Math.round(100 - (Math.log10(rank) / 7 * 100))) : null;

    const data = {
      authorityScore,
      organicKeywords:  organicKw,
      organicTraffic,
      backlinks,
      referringDomains: refDomains
    };

    const hasData = Object.values(data).some(v => v !== null && v > 0);

    if (!hasData) {
      return res.json({
        success: false,
        error: `No data returned for ${domain}. Check SEMrush API key has credits.`,
        _debug: { domain, ovHeaders: Object.keys(ov), ovData: ov, blData: bl }
      });
    }

    res.json({ success: true, data });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SEMrush proxy running on port ${PORT}`));
