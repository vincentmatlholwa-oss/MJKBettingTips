require('dotenv').config();
var fetch = require('node-fetch');
var TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) { console.error('Set TELEGRAM_BOT_TOKEN in .env first'); process.exit(1); }

async function getGroupId() {
  var r = await fetch('https://api.telegram.org/bot' + TOKEN + '/getChat?chat_id=@MJKBettingTips');
  var d = await r.json();
  console.log(JSON.stringify(d, null, 2));
}

getGroupId();
