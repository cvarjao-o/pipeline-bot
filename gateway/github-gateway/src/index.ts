import { Application, Context } from 'probot' // eslint-disable-line no-unused-vars
import {spawnSync, spawn} from 'child_process'
import {createWriteStream, readFileSync, openSync, writeSync, closeSync} from 'fs'
import { Response, ChecksListForSuiteResponse, ChecksCreateParams} from '@octokit/rest';
import * as fs from 'fs';
import {getWorkflows, getAllWorkflows, getChecksForSuite, asArray} from './Util';
import * as util from './Util';
import {Toposort} from './Toposort';
import * as mod_path from 'path';

import {OpenshiftClientTool as oc} from './OpenshiftClientTool'
import { GitHubAPI } from 'probot/lib/github';
import { Workflows, Job, Checkrun } from './Model';
import { pathToFileURL } from 'url';
import Github = require('@octokit/rest');

//import * as child_process from 'child_process';

export = (app: Application) => {
  function checkout(context:any){
    // OWNER or COLLABORATOR
    const payload = context.payload;
    const base_sha = (payload.pull_request || payload.check_run.pull_requests[0]).base.sha;
    const head_sha = (payload.pull_request || payload.check_run.pull_requests[0]).head.sha;
    const repo_full_name = payload.repository.full_name;
    const clone_url = payload.repository.clone_url;

    //create PVC
    const gitWorkDirectory = `/tmp/.workflows-bot/${repo_full_name}/${head_sha}`
    return new Promise((resolve, reject) => {
      const dirName = mod_path.dirname(gitWorkDirectory);
      fs.mkdir(dirName, {recursive: true}, (err: any)=>{
        if (err) {
          if (err.code == 'EEXIST'){
            resolve(true);
          }else{
            reject(err);
          }
        }else{
          resolve(true);
        }
      });
    })
    .then(()=>{
      return new Promise((resolve, reject) => {
        //initialize
        const args = ['init', gitWorkDirectory]
        const cmd=spawn('git',args)
        cmd.on('close', (code) => {
          resolve(code)
        })
      })
    })
    .then(()=>{
      //Add remote 'origin' (repository.clone_url)
      return new Promise((resolve, reject) => {
        const args = ['-C',gitWorkDirectory,'remote','add','origin', clone_url]
        const cmd=spawn('git',args)
        cmd.on('close', (code) => {
          resolve(code)
        })
      });
    })
    .then(()=>{
      //fetch pull request branch
      return new Promise((resolve, reject) => {
        const args = ['-C',gitWorkDirectory, 'fetch', 'origin', head_sha]
        const cmd=spawn('git',args)
        cmd.on('close', (code) => {
          resolve(code)
        })
      });
    })
    .then(()=>{
      //checkout
      return new Promise((resolve, reject) => {
        const args = ['-C',gitWorkDirectory, 'checkout', '--detach', head_sha]
        const cmd=spawn('git',args)
        cmd.on('close', (code) => {
          resolve(code)
        })
      });
    })
    .then(()=>{
      //reset
      return new Promise((resolve, reject) => {
        const args = ['-C',gitWorkDirectory,'reset','--hard']
        const cmd=spawn('git',args)
        cmd.on('close', (code) => {
          resolve(code)
        })
      });
    })
    .then(()=>{
      //Check if author is collaborator
      return new Promise((resolve, reject) => {
        const args = ['-C', gitWorkDirectory, 'ls-tree', '--name-only', '-r', base_sha, '.bcgov/workflows'];
        const cmd=spawn('git', args);
        let stdout = "";

        cmd.stdout.on('data', (data) => {
          stdout+=data;
        });

        cmd.on('close', (code) => {
          resolve(stdout.length > 0);
        });
      })
      .then((hasWorkflowsInBase) =>{
        return new Promise((resolve, reject) => {
          if (hasWorkflowsInBase === true && 'COLLABORATOR' !== payload.pull_request.author_association){
            app.log.info(`Resetting protected workflow directory to base branch (${base_sha})`);
            const args = ['-C', gitWorkDirectory, 'checkout', base_sha, '--', '.bcgov/workflows/*'];
            const cmd=spawn('git', args);
            cmd.on('close', (code) => {
              resolve(code);
            })
          }else{
            resolve(1)
          }
        });
      });
    })
    .then (()=>{
      return gitWorkDirectory;
    })
  }

  app.on('job.run', async (context) => {
    const job:Job =context.payload.job;
    const check_run:Checkrun = context.payload.check_run;

    await context.github.checks.update({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      check_run_id: check_run.id,
      status: 'in_progress'
    });

    let summary = '';
    for (let step of job.steps){
      let dockerImageUri = null;
      if (step.uses){
        if (step.uses.startsWith('docker://')){
          dockerImageUri = step.uses.substring(9);
        }else if (step.uses.startsWith('openshift:///')){
          dockerImageUri = `docker-registry.default.svc:5000/csnr-devops-lab-tools/${step.uses.substring(13)}`
        }else if (step.uses.startsWith('openshift://')){
          dockerImageUri = `docker-registry.default.svc:5000/${step.uses.substring(12)}`
        }
      }
      app.log(`job.run - job:${job.id} step=${step.id}, image=${dockerImageUri}`);
      if (dockerImageUri){
        const podNamespace = step.namespace || job.namespace;
        const podName = `step-${check_run.id}`
        const args = [`--namespace=${podNamespace}`, 'run', `${podName}`, `--image=${dockerImageUri}`, '--labels=workflow=true', `--labels=chekrun=${check_run.id}`, '--command=true', '-it', '--rm=true', '--restart=Never', '--']
        args.push(...util.asArray(step.run))
        args.push(...util.asArray(step.args))
        app.log(...args)
        let logPath = `/tmp/check_run_${podName}.log.txt`
        if (summary.length > 0) summary += '\n';
        summary+=logPath
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
      }
    } //for - steps

    await context.github.checks.update({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      check_run_id: check_run.id,
      status: 'completed',
      conclusion: 'success',
      output: {title: 'output', summary: `Check log files: ${summary}`}
    });

  });
  app.on(['check_run.created', 'check_run.completed'], async (context) => {
    app.log(`${context.event}.${context.payload.action} - ${context.payload.check_run.head_sha}`);
    const workflows:Workflows = await getAllWorkflows(context, context.payload.repository, context.payload.check_run.head_sha);
    //const check_run = context.payload.check_run;
    //const job = util.getJobFromCheckrun(workflows, context.payload.check_run);
    const runIfReady = async (check_run:Checkrun) : Promise<boolean> => {
      const ret:boolean = false;
      if (check_run.completed_at == null && check_run.status !== 'in_progress' ){
        const job:Job = util.getJobFromCheckrun(workflows, context.payload.check_run) as Job;
        if (util.canJobBeStarted(job, check_run)){
          //if the job has an input, just register a check_run action, and wait for the check_run.requested_action event
          if ((job.input !=null)){
            if (util.asArray(check_run.actions).length == 0){
              //add input
              await context.github.checks.update({
                owner: context.payload.repository.owner.login,
                repo: context.payload.repository.name,
                check_run_id: check_run.id,
                name: check_run.name,
                actions: [{
                  "label": "Approve",
                  "description": "Approve",
                  "identifier": `${job.id}`
                }]
              })
            }
          }else{ // start job
            const pullRequest:Github.Response<Github.PullRequestsGetResponse> = await context.github.pullRequests.get({owner:context.payload.repository.owner.login, repo:context.payload.repository.name, number: context.payload.check_run.pull_requests[0].number});
            const payload = {
              action: 'run',
              check_run: check_run,
              repository: context.payload.repository,
              installation: context.payload.installation,
              pull_request: pullRequest.data,
              job: job
            };
            app.receive({name: 'job',  payload: payload});
          }
        }
      }
      return ret;
    };
    if (context.payload.action === 'created'){
      await runIfReady(context.payload.check_run);
    } else { //completed
      const check_runs = await getChecksForSuite(context, context.payload.repository, context.payload.check_run.check_suite.id, context.payload.check_run.started_at);
      for (const check_run of check_runs.values()){
        if (check_run.status !== 'completed'){
          const started:boolean = await runIfReady(check_run);
          if (!started){
            break;
          }
        }
      }
    }
  });
  app.on(['pull_request.closed'], async context => {
    context.github.checks.listForRef({owner:context.payload.repository.owner.login, repo: context.payload.repository.name, ref: context.payload.pull_request.head.sha})
    .then(async (check_runs)=>{
      for (let check_run of check_runs.data.check_runs){
        if (check_run.status != 'completed'){
          await context.github.checks.update({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            check_run_id: check_run.id,
            status: 'completed',
            conclusion: 'cancelled'
          });
        }
      }
    })
  });
  app.on(['pull_request.opened', 'pull_request.reopened', 'pull_request.synchronize'], async context => {
    checkout(context);
    app.log(`${context.event}.${context.payload.action} - ${context.payload.pull_request.base.sha} (${context.payload.pull_request.head.sha})`);
    const workflows:Workflows = await getWorkflows(context, context.payload.pull_request.head.repo, context.payload.pull_request.head.sha);
    const now = new Date();
    for (let workflow of workflows) {
      const jobs : Job[] =  util.listJobs(workflow, context);
      for (let job of jobs) {
        const check_run : ChecksCreateParams = {
          owner: context.payload.pull_request.base.repo.owner.login,
          repo: context.payload.pull_request.base.repo.name,
          name: job.id as string,
          head_sha: context.payload.pull_request.head.sha,
          started_at: now.toISOString(),
          external_id: `${workflow.name}/${job.id}`
        }
        const checkrun = await context.github.checks.create(check_run);
        console.dir(checkrun.data.check_suite.id);
      }
    }

  });
}
