const {spawnSync} = require('child_process');
const fs = require('fs');

/**
 * This is the entry point for your Probot App.
 * @param {import('probot').Application} app - Probot's Application class.
 */
module.exports = app => {
  // Your code here
  app.log('Yay, the app was loaded!')

  app.on('issues.opened', async context => {
    const issueComment = context.issue({ body: 'Thanks for opening this issue!' })
    return context.github.issues.createComment(issueComment)
  })

  app.on('pull_request.reopened', async context =>{
    app.log(`name:'${context.name}' action:'${context.payload.action}'`)
  })

  app.on('pull_request.synchronize', async context =>{
    app.log(`name:'${context.name}' action:'${context.payload.action}'`)
    try {
      await context.github.repos.getContent({owner:context.payload.pull_request.head.repo.owner.login, repo:context.payload.pull_request.head.repo.name, path:'.pipeline/pipeline.js', ref:context.payload.pull_request.head.ref})
      const workspace=`/tmp/pipeline/workspace/${context.payload.repository.full_name}/pr-${context.payload.number}`
      var shell = require('shelljs');
      shell.mkdir('-p', workspace)
      if (!shell.test('-d', `${workspace}/.git`)){
        if (shell.exec(`git clone --single-branch --no-tags --depth 1 "${context.payload.pull_request.head.repo.clone_url}" -b "${context.payload.pull_request.head.ref}" "${workspace}"`).code !== 0) {
          shell.echo('Error: Git clone failed');
        }
      }else{
        shell.cd(workspace)
        shell.exec(`git clean -fd`)
        shell.exec(`git pull --ff-only`)
      }
      shell.cd(workspace)
      if (shell.exec(`.pipeline/cli.sh "pipeline"`).code !== 0) {
        shell.echo('Error: .pipeline/cli.sh failed');
      }
      //If it didn't fail, it means the file exists
      //Checkout Code
      //Run Pipeline

    }catch(err){
      if (err.code !== 404){
        throw(err)
      }
    }
  })

  app.on('pull_request.closed', async context =>{
    app.log(`name:'${context.name}' action:'${context.payload.action}'`)
  })
  
  app.on('issue_comment.created', async context =>{
    if (context.payload.issue.pull_request){
      if (context.payload.comment.author_association === 'COLLABORATOR'){
        if (context.payload.comment.body.startsWith('/approve')){
          const workspace=`/tmp/pipeline/workspace/${context.payload.repository.full_name}/pr-${context.payload.issue.number}`
          var shell = require('shelljs');
          shell.cd(workspace)
          fs.writeFileSync(`${workspace}/.pipeline/pipeline.input.json`, '{"accept":true, "comment":""}', {encoding:'utf-8'})
          if (shell.exec(`.pipeline/cli.sh "pipeline"`).code !== 0) {
            shell.echo('Error: .pipeline/cli.sh failed');
          }
        }
      }
    }
  })
  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}
