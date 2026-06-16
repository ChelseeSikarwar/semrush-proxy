// v10 - SEMrush + SerpAPI rich results
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

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return {};
  const headers = lines[0].split(';').map(h => h.trim().replace(/\r/g, ''));
  const vals = lines[1].split(';').map(v => v.trim().replace(/\r/g, ''));
  const obj = {};
  headers.forEach((h, i) => obj[h] = vals[i] || '');
  return obj;
}

// Raw debug endpoint
app.get('/raw', async (req, res) => {
  const { domain, key } = req.query;
  if (!domain || !key) return res.json({ error: 'Need domain and key params' });
  try {
    const ovUrl = `https://api.semrush.com/?type=domain_ranks&key=${key}&export_columns=Dn,Rk,Or,Ot,Ad,At&domain=${domain}&database=us`;
    const r = await fetch(ovUrl);
    const text = await r.text();
    res.json({ overview: text });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// Rich Results Test via SerpAPI
app.get('/rich-results', async (req, res) => {
  const { url: siteUrl, serpKey } = req.query;
  if (!siteUrl || !serpKey) return res.json({ error: 'Need url and serpKey params' });
  try {
    const apiUrl = `https://serpapi.com/search.json?engine=google_rich_results&url=${encodeURIComponent(siteUrl)}&api_key=${serpKey}`;
    const r = await fetch(apiUrl);
    const d = await r.json();
    console.log('SerpAPI rich results:', JSON.stringify(d).substring(0, 500));

    // Count errors from rich results
    let structuredDataErrors = 0;
    if (d.structured_data) {
      d.structured_data.forEach(item => {
        if (item.errors) structuredDataErrors += item.errors.length;
        if (item.warnings) structuredDataErrors += item.warnings.length;
      });
    }
    if (d.detected_extensions) {
      const ext = d.detected_extensions;
      if (ext.errors) structuredDataErrors += ext.errors;
    }

    res.json({ 
      success: true, 
      structuredDataErrors,
      raw: d
    });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// Main SEMrush endpoint
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
    // domain_ranks — traffic, keywords, rank
    const ovUrl = `https://api.semrush.com/?type=domain_ranks&key=${semrushKey}&export_columns=Dn,Rk,Or,Ot,Ad,At&domain=${domain}&database=us`;
    // backlinks_overview — total backlinks
    const blUrl = `https://api.semrush.com/?type=backlinks_overview&key=${semrushKey}&target=${domain}&target_type=root_domain&export_columns=ascore,total,domains_num,urls_num,ips_num,ipclassc_num,follows_num,nofollows_num`;
    // backlinks_refdomains — referring domains
    const rdUrl = `https://api.semrush.com/?type=backlinks_refdomains&key=${semrushKey}&target=${domain}&target_type=root_domain&export_columns=domain_ascore,domain,backlinks_num,ip&display_limit=1`;

    const [ovRes, blRes, rdRes] = await Promise.all([fetch(ovUrl), fetch(blUrl), fetch(rdUrl)]);
    const [ovText, blText, rdText] = await Promise.all([ovRes.text(), blRes.text(), rdRes.text()]);

    console.log('OV:', JSON.stringify(ovText.substring(0, 300)));
    console.log('BL:', JSON.stringify(blText.substring(0, 300)));
    console.log('RD:', JSON.stringify(rdText.substring(0, 300)));

    const ov = parseCSV(ovText);
    const bl = parseCSV(blText);

    const rank = parseInt(ov['Rank'] || ov['Rk']) || 0;

    // Referring domains — count lines in rdText (each line after header = 1 referring domain)
    const rdLines = rdText.trim().split('\n').filter(l => l.trim() && !l.startsWith('domain_ascore'));
    const refDomainsCount = rdLines.length > 0 && !rdText.includes('NOTHING FOUND') ? rdLines.length : 
                            parseInt(bl['Domains'] || bl['domains_num']) || null;

    const data = {
      authorityScore:   rank ? Math.min(100, Math.round(100 - (Math.log10(rank) / 7 * 100))) : null,
      organicKeywords:  parseInt(ov['Organic Keywords'] || ov['Or']) || null,
      organicTraffic:   parseInt(ov['Organic Traffic']  || ov['Ot']) || null,
      backlinks:        parseInt(bl['Total'] || bl['total'] || bl['Backlinks']) || null,
      referringDomains: parseInt(bl['Domains'] || bl['domains_num']) || refDomainsCount,
      spamScore:        null  // Not available via SEMrush API — use DataForSEO if needed
    };

    console.log('Result:', JSON.stringify(data));
    res.json({ success: true, data, domain });

  } catch (err) {
    console.error('Error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SEMrush proxy v10 on port ${PORT}`));
