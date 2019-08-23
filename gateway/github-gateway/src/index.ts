import { Application, Context } from 'probot' // eslint-disable-line no-unused-vars
import {spawnSync, spawn} from 'child_process'
import {createWriteStream, readFileSync, openSync, writeSync, closeSync} from 'fs'
import { Response, ChecksListForSuiteResponse, ChecksCreateParams} from '@octokit/rest';
import * as fs from 'fs';
import {getWorkflow, getChecksForSuite, asArray} from './Util';
import * as util from './Util';

import {Toposort} from './Toposort';

import {OpenshiftClientTool as oc} from './OpenshiftClientTool'
import { GitHubAPI } from 'probot/lib/github';

//import * as child_process from 'child_process';

export = (app: Application) => {

  app.on('check_run.run', async (context) => {
    
    const item = context.payload.task;
    const check_run_id = context.payload.check_run.id;
    const check_run_name = context.payload.check_run.name;
    let dockerImageUri = null;
    
    if (item.uses){
      if (item.uses.startsWith('docker://')){
        dockerImageUri = item.uses.substring(9);
      }else if (item.uses.startsWith('openshift:///')){
        dockerImageUri = `docker-registry.default.svc:5000/csnr-devops-lab-tools/${item.uses.substring(13)}`
      }else if (item.uses.startsWith('openshift://')){
        dockerImageUri = `docker-registry.default.svc:5000/${item.uses.substring(12)}`
      }
    }
    app.log(`check_run.run - name=${item.name}, image=${dockerImageUri}`);
    if (dockerImageUri){
      await context.github.checks.update({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        check_run_id: check_run_id,
        status: 'in_progress'
      })

      //const dockerImageUri = item.uses.substring(9);
      const args = ['--namespace=csnr-devops-lab-tools', 'run', `${item.name}`, `--image=${dockerImageUri}`, '--labels=workflow=true', '--command=true', '-it', '--wait=true', '--restart=Never', '--']
      args.push(...item.runs)
      app.log(...args)
      let logPath = `/tmp/check_run_${check_run_id}.log.txt`
      await new Promise((resolve, reject) => {
        if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
        fs.open(logPath, 'a', (err, log) => {
          writeSync(log, `# oc ${args.join(" ")}\n`, null, 'utf-8');
          const cmd=oc.spawn(args, {stdio: [process.stdin, log, log]})
          cmd.on('close', (code) => {
            closeSync(log);
            resolve(code)
          })
        });
      })
      .then(async (status)=>{
        return new Promise((resolve, reject) => {
          fs.readFile(logPath, {encoding: 'utf-8'}, (err, stdout) => {
            resolve({status, stdout})
          })
        })
      }).then((cmd:any) => {
        let conclusion:any = 'success'
        if (cmd.status !== 0){
          conclusion = 'failure'
        }
        return context.github.checks.update({
          owner: context.payload.repository.owner.login,
          repo: context.payload.repository.name,
          check_run_id: check_run_id,
          name: check_run_name,
          status: 'completed',
          conclusion: conclusion,
          output: {
            title: `Output`,
            summary: `exit code = ${cmd.status}`,
            text: cmd.stdout
          }
        })
      })
    } else if(item.conclusion){
      await context.github.checks.update({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        check_run_id: check_run_id,
        name: check_run_name,
        status: 'completed',
        conclusion: item.conclusion
      })
    }
  });

  app.on(['check_run.requested_action'], async (context) => {
    app.log(`${context.event}.${context.payload.action} - ${context.payload.check_run.name} (${context.payload.check_run.id})`);
    const workflow = await getWorkflow(context, context.payload.repository, context.payload.check_run.head_sha);
    const action = workflow.actions[context.payload.check_run.name]
    const input = action.action[context.payload.requested_action.identifier]

    const payload = {
      action: 'run',
      check_run: context.payload.check_run,
      repository: context.payload.repository,
      installation: context.payload.installation,
      task: Object.assign(action, input, {name:`${context.payload.check_run.name}-${context.payload.requested_action.identifier}`.toLowerCase()})
    };
    app.receive({name: 'check_run',  payload: payload});
    
  })
  /* 
  app.on(['check_suite.rerequested'], async (context) => {
    app.log(`${context.event}.${context.payload.action} - ${context.payload.check_suite.head_branch} (${context.payload.check_suite.head_sha})`);
  }) */
  app.on(['check_run.created', 'check_run.completed'], async (context) => {
    app.log(`${context.event}.${context.payload.action} - ${context.payload.check_run.name} (${context.payload.check_run.id})`);
    
    const workflow = await getWorkflow(context, context.payload.repository, context.payload.check_run.head_sha);
    const check_runs = await getChecksForSuite(context, context.payload.repository, context.payload.check_run.check_suite.id, context.payload.check_run.started_at);

    /*
    const failAction = (action: any, check_run:any) => {
      app.log(`Cancelling ${check_run.name}`)
      //cancel it
      context.github.checks.update({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        check_run_id: check_run.id,
        name: check_run.name,
        status: 'completed',
        conclusion: 'cancelled'
      })

      for (let name of Object.keys(workflow.actions)){
        const dependant = workflow.actions[name]
        if (util.asArray(dependant.needs).indexOf(check_run.name)>=0){
          //failAction(dependant, check_runs.get(name))
        }
      }
    }
    */
    const runIfReady = (check_run:any) : boolean => {
      let result = true;
      const action = workflow.actions[check_run.name]
      const needs = util.resolveNeeds(check_runs, action)
      const needsSummary = util.getNeedsSummary(needs)
      //app.log(`Checking "${check_run.name}" => `, "action=", JSON.stringify(action, null, 2))
      //app.log(`Checking "${check_run.name}" => `, "needs (raw)=", JSON.stringify(action.needs, null, 2))
      //app.log(`Checking "${check_run.name}" => `, "needs (resolved)=", JSON.stringify(needs, null, 2))
      //app.log(`Checking "${check_run.name}" => `, "summary=", JSON.stringify(needsSummary, null, 2))
      if (needsSummary.status === 'completed'){
        if (needsSummary.conclusion === 'success' || needsSummary.conclusion === 'neutral'){
          if (!action.action) {
            const payload = {
              action: 'run',
              check_run: check_run,
              repository: context.payload.repository,
              installation: context.payload.installation,
              task: Object.assign(action, {name:check_run.name})
            };
            app.receive({name: 'check_run',  payload: payload});
          }else{
            app.log(`Checking "${check_run.name}"=>`, `Adding actions/imputs for ${check_run.name}`)
            //Add actions/inputs
            const actions = []
            for (let name of Object.keys(action.action)){
              const actionDef = action.action[name]
              actions.push({
                label: actionDef.label || name,
                description: actionDef.description || actionDef.label || name,
                identifier: name
              })
            }
            if (actions.length > 0 ){
              context.github.checks.update({
                owner: context.payload.repository.owner.login,
                repo: context.payload.repository.name,
                check_run_id: check_run.id,
                name: check_run.name,
                actions: actions
              })
            }
          }
        }else{
          app.log(`Checking "${check_run.name}"=>`,`Cancelling. summary={status:'${needsSummary.status}', conclusion:'${needsSummary.conclusion}'}`)
          util.cancel(context, workflow, check_runs, check_run)
          result = false
        }
      }
      return result;
    }

    if (context.payload.action === 'created'){
      runIfReady(context.payload.check_run);
    }else { //completed
      for (const check_run of check_runs.values()){
        if (check_run.status !== 'completed'){
          if (!runIfReady(check_run)){
            break;
          }
        }
      }
    }
  });

  /*
  app.on('issues.opened', async (context) => {
    const issueComment = context.issue({ body: 'Thanks for opening this issue!...' })
    await context.github.issues.createComment(issueComment)
  });
  */

  app.on(['pull_request.opened', 'pull_request.reopened', 'pull_request.synchronize'], async context => {
    app.log(`${context.event}.${context.payload.action} - ${context.payload.pull_request.base.sha} (${context.payload.pull_request.head.sha})`);
    const workflow = await getWorkflow(context, context.payload.pull_request.head.repo, context.payload.pull_request.head.sha);
    const actions : string[] =  util.listActions(workflow, context);
    app.log("check_runs => ", actions)
    const now = new Date();
    for (let key of actions) {
      const item = workflow.actions[key]
      const check_run : ChecksCreateParams = {
        owner: context.payload.pull_request.base.repo.owner.login,
        repo: context.payload.pull_request.base.repo.name,
        name: key,
        head_sha: context.payload.pull_request.head.sha,
        started_at: now.toISOString()
      }
      const checkRun = await context.github.checks.create(check_run)
      item.check_run_id = checkRun.data.id
    }

  });
  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}
