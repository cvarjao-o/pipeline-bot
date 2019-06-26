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


const octokit = require('@octokit/rest')()
octokit.authenticate({type:'app', token:token})

octokit.apps.getInstallations().then(result => {
  return octokit.apps.createInstallationToken({installation_id:result.data[0].id}).then(result => {
    return result.data
  })
})
.then( result => {
  console.dir(result)
})
/*
.then( access_token =>{
  octokit.authenticate({type:'token', token:access_token})
  return octokit.issues.createComment({owner:'cvarjao-o', repo:'hello-world', number:'1', body:`testing`})
})
*/

/*
const axios = require('axios');
axios.get('https://api.github.com/app/installations', {headers:{'Authorization':`Bearer ${token}`, 'User-Agent':'Pipeline/bot', 'Accept':'application/vnd.github.machine-man-preview+json'}}).then(response =>{
  console.log(response.data);
})
*/


/*
const https = require('https');
https.get({protocol:'https:', host:'api.github.com', path:'/app/installations', headers:{'Authorization':`Bearer ${token}`, 'User-Agent':'Pipeline/bot', 'Accept':'application/vnd.github.machine-man-preview+json'}}, (resp) => {
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
*/
