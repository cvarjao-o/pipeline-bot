//
//https://developer.github.com/apps/building-github-apps/authenticating-with-github-apps/#authenticating-as-an-installation


const jwt = require('jsonwebtoken')
const fs = require('fs')

const options = {id:'17861'}
options.cert = fs.readFileSync('/Users/cvarjao/Documents/GitHub/cvarjao-o/pipeline-bot/dev-bot/cvarjao-bot.2018-09-20.private-key.pem');

const payload = {
  exp: Math.floor(Date.now() / 1000) + 60,  // JWT expiration time
  iat: Math.floor(Date.now() / 1000),       // Issued at time
  iss: options.id                           // GitHub App ID
}
// Sign with RSA SHA256
var token = jwt.sign(payload, options.cert, { algorithm: 'RS256' })

//console.log(token)

const https = require('https');


https://api.github.com/repos/cvarjao-o/hello-world/issues/1/comments?client_id=Iv1.c272f2adb495a526&client_secret=8e801c568bb43d9af7c168c4f4ccaa12ff435b1a

https.get({protocol:'https:', host:'api.github.com', path:'/repos/cvarjao-o/hello-world/issues', headers:{'Authorization':`Bearer ${token}`, 'User-Agent':'Pipeline/bot', 'Accept':'application/vnd.github.machine-man-preview+json'}}, (resp) => {
  let data = '';

  // A chunk of data has been recieved.
  resp.on('data', (chunk) => {
    data += chunk;
  });

  // The whole response has been received. Print out the result.
  resp.on('end', () => {
    console.dir(JSON.parse(data));
  });
})

