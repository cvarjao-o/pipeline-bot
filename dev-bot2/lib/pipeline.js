
const fs = require('fs');
const {spawn, spawnSync} = require('child_process')
const shell = require('shelljs');

const workspacesDir = '/tmp/pipeline/workspace'
const buildsDir = '/tmp/pipeline/build'


async function startPipeline(app, context){
  app.log(`name:'${context.name}' action:'${context.payload.action}'`)
  try {
    await context.github.repos.getContent({owner:context.payload.pull_request.head.repo.owner.login, repo:context.payload.pull_request.head.repo.name, path:'.pipeline/pipeline.js', ref:context.payload.pull_request.head.ref})
    const workspace=`${workspacesDir}/${context.payload.repository.full_name}/pr-${context.payload.number}`

    var inProgressComment = await context.github.issues.createComment({owner:context.payload.organization.login, repo:context.payload.repository.name, number:context.payload.pull_request.number, body:'Starting new build ...'})

    shell.mkdir('-p', workspace)
    if (!shell.test('-d', `${workspace}/.git`)){
      if (spawnSync('git', ['clone',  '--single-branch', '--no-tags', '--depth', '1', `${context.payload.pull_request.head.repo.clone_url}`, '-b', `${context.payload.pull_request.head.ref}`, `${workspace}`], {cwd:workspace}).status != "0"){
        app.log('Error: Git clone failed');
      }
    }else{
      spawnSync('git', ['clean',  '-fd'], {cwd:workspace})
      spawnSync('git', ['pull',  '--ff-only'], {cwd:workspace})
    }
    execPipeline(workspace, app, context)
    await context.github.issues.deleteComment({owner:context.payload.organization.login, repo:context.payload.repository.name, comment_id:inProgressComment.data.id})
  }catch(err){
    if (err.code !== 404){
      throw(err)
    }
  }
}
async function execPipeline(workspace, app, context){
  const buildDir=`${buildsDir}/${context.payload.repository.full_name}/pr-${context.payload.number}`
  const pipelineDir = `${workspace}/.pipeline`
  const pipelineOutFile = `${buildDir}/pipeline.out.txt`

  app.log(`Executing pipeline - ${pipelineDir} > ${pipelineOutFile}`)
  shell.mkdir('-p', buildDir)
  const exitCode = await new Promise((resolve)=>{
    const stdio = fs.openSync(`${pipelineOutFile}`, 'w');
    spawnSync('npm', ['ci'], {cwd:`${pipelineDir}`})
    const pipeline=spawn('npm', ['run', "pipeline"], {cwd:`${pipelineDir}`, stdio:[process.stdin, stdio, stdio]})
    pipeline.on('error', function(err) {
      console.log(err)
    });
    
    pipeline.on('close', function(code) {
      app.log(`nexit code = ${code}`)
      fs.writeSync(stdio, `\nexit code = ${code}`)
      fs.closeSync(stdio);
      resolve(code)
    })
  })

  if (exitCode !== 0) {
    app.log('Error: .pipeline/cli.sh failed');
  }

  app.log(`Pipeline Executed with Exit Code = ${exitCode}`)
  var status= ''
  if (fs.existsSync(`${workspace}/.pipeline/pipeline.state.json`)){
    var state = JSON.parse(fs.readFileSync(`${workspace}/.pipeline/pipeline.state.json`, {encoding:'utf-8'}))
    for (var prop in state) {
      if(!state.hasOwnProperty(prop)) continue;
      var stage = state[prop];
      let gitHubCheckStatus = 'queued'
      let gitHubConclusion = null;
      let githubCheckCompletedAt = null

      if (stage.duration !=null && stage.output != null){
        status+=`:sunglasses: ${prop} (${stage.duration[0]}s)\n`
        gitHubCheckStatus = 'completed'
        gitHubConclusion = 'success'
        githubCheckCompletedAt = new Date()
      }else if (stage.duration !=null){
        status+=`\n:sleeping: ${prop} (${stage.duration[0]}s)\n---\n`
        gitHubCheckStatus = 'in_progress'
      }else{
        status+=`:no_mouth: ${prop}\n`
        gitHubCheckStatus = 'queued'
      }

      context.github.checks.create(context.repo({
        name: prop,
        head_branch: context.payload.check_suite.head_branch,
        head_sha: context.payload.check_suite.head_sha,
        status: gitHubCheckStatus,
        conclusion: gitHubConclusion,
        completed_at: githubCheckCompletedAt,
        actions:[
          {identifier:`${prop}`, label:'re-run', description:'Re-run this step'}
        ]
      }))
    }
  }else{
    status+=`Oops, pipeline state file is missing. It may not have ran :( \n`
  }

  await context.github.issues.createComment({owner:context.payload.organization.login, repo:context.payload.repository.name, number:(context.payload.pull_request || context.payload.issue).number, body:`Pipeline Executed with Exit Code = ${exitCode}\n${status}`})
  //If it didn't fail, it means the file exists
  //Checkout Code
  //Run Pipeline
}

module.exports = exports = (app)=>{
  app.on('pull_request.synchronize', context =>{
    startPipeline(app, context)
  })

  app.on('check_suite.rerequested', context =>{
    context.github.checks.create(context.repo({
      name: 'build',
      head_branch: context.payload.check_suite.head_branch,
      head_sha: context.payload.check_suite.head_sha,
      status: 'completed',
      conclusion: 'success',
      completed_at: new Date(),
      output: {
        title: 'Build',
        summary: 'Build complete successfully!'
      },
      actions:[
        {identifier:'rerun', label:'re-run', description:'Re-run this step'}
      ]
    }))
  })

  app.on('pull_request.reopened', context =>{
    const workspace=`${workspacesDir}/${context.payload.repository.full_name}/pr-${context.payload.number}`
    shell.rm('-rf', workspace)
    startPipeline(app, context)
  })

  app.on('pull_request.opened', context =>{
    startPipeline(app, context)
  })

  app.on('pull_request.closed', async context =>{
    const workspace=`${workspacesDir}/${context.payload.repository.full_name}/pr-${context.payload.number}`
    app.log(`Deleting ${workspace}`)
    shell.rm('-rf', workspace)
    app.log(`Deleted ${workspace}`)
    await context.github.issues.createComment({owner:context.payload.organization.login, repo:context.payload.repository.name, number:context.payload.pull_request.number, body:`Pipeline Workspace has been cleared`})
  })

  app.on('issue_comment.created', async context =>{
    if (context.payload.issue.pull_request){
      if (context.payload.comment.body.startsWith('/approve')){
        if (context.payload.comment.author_association === 'COLLABORATOR'){
          const workspace=`${workspacesDir}/${context.payload.repository.full_name}/pr-${context.payload.issue.number}`
          if (shell.test('-d', workspace)){
            fs.writeFileSync(`${workspace}/.pipeline/pipeline.input.json`, '{"accept":true, "comment":""}', {encoding:'utf-8'})
            execPipeline(workspace, app, context)
          }else{
            app.log(`Workspace does NOT exist`)
          }
        }else{
          app.log(`User ${context.payload.comment.user.login} is NOT a 'COLLABORATOR'`)
        }
      }
    }
  })
}