var express = require('express')
var webhooks = require('@octokit/webhooks')
var app = express()
const config = require('./config.js')

app.log = console.log

var webhooks = new webhooks({path:'/', secret: 'da6f9bca-3102-482e-bdb8-1dd4c7685ad5'})
app.use(webhooks.middleware)


const octokit = require('@octokit/rest')
const pipeline = require('./lib/pipeline.js')
const github = octokit()
var lastAccessToken = undefined

async function updateAccessToken() {
  const tokenTimeToLiveInSeconds = 3600; //1 hour
  if (lastAccessToken == null || process.hrtime(lastAccessToken)[0] > tokenTimeToLiveInSeconds){
    const github1 = octokit()
    const jwt = require('jsonwebtoken')
    const fs = require('fs')
    
    const options = {id:config.github.app.id}
    options.cert = fs.readFileSync(config.github.app.key);
    
    const payload = {
      exp: Math.floor(Date.now() / 1000) + 60,  // JWT expiration time
      iat: Math.floor(Date.now() / 1000),       // Issued at time
      iss: options.id                           // GitHub App ID
    }
    // Sign with RSA SHA256
    var appJwt = jwt.sign(payload, options.cert, { algorithm: 'RS256' })
    console.log("JWT:", appJwt)
    github1.authenticate({type:'app', token:appJwt})
    
    var access_token  = await github1.apps.getInstallations().then(result => {
      return github1.apps.createInstallationToken({installation_id:result.data[0].id}).then(result => {
        return result.data.token
      })
    })
    lastAccessToken = process.hrtime()
    github.authenticate({type:'token', token:access_token})
  }
}

function repo(event) {
  return function (args){
    var info={owner:`${event.payload.repository.owner.login}`, repo:`${event.payload.repository.name}`}
    return Object.assign(info, args || {})
  }
}

updateAccessToken()

webhooks.on('*', async (event) => {
  var eventName = `${event.name}`
  if (event.payload.action){
    eventName = `${event.name}.${event.payload.action}`
  }
  updateAccessToken()

  console.log(eventName,  'webhook received')
  await app.emit(eventName, Object.assign(event, {'github':github, repo: repo(event)}))
  //console.dir(event.payload)
})

pipeline(app);

const PORT = 5000;
app.listen(PORT, () => {
    console.log('Express server listening on port ' + PORT);
})

const SmeeClient = require('smee-client')

const smee = new SmeeClient({
  source: 'https://smee.io/uaUO7ep4WTMvws09',
  target: `http://localhost:${PORT}`,
  logger: console
})

const events = smee.start()
