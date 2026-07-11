var fetch = require('node-fetch');
var TOKEN = '8771029215:AAHbGvrzyT13tFBYEG89Ub4FK-IWSQN_o8Q';

async function getGroupId() {
  var r = await fetch('https://api.telegram.org/bot' + TOKEN + '/getChat?chat_id=@MJKBettingTips');
  var d = await r.json();
  console.log(JSON.stringify(d, null, 2));
}

getGroupId();
