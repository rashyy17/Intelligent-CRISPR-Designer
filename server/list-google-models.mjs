// usage: GOOGLE_API_KEY=your_key node list-google-models.mjs
import https from 'https';

const key = process.env.GOOGLE_API_KEY;
if (!key) {
  console.error('Set GOOGLE_API_KEY in env before running:');
  console.error('  GOOGLE_API_KEY=your_key node list-google-models.mjs');
  process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

const req = https.request(url, { method: 'GET' }, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    try {
      const j = JSON.parse(data);
      console.log(JSON.stringify(j, null, 2));
    } catch (err) {
      console.error('Failed to parse response:', err);
      console.error(data);
      process.exit(1);
    }
  });
});
req.on('error', (err) => {
  console.error('Request failed:', err);
  process.exit(1);
});
req.end();
