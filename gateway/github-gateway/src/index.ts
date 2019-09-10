import { Application, Context } from 'probot' // eslint-disable-line no-unused-vars
import {spawnSync, spawn} from 'child_process'
import {createWriteStream, readFileSync, openSync, writeSync, closeSync} from 'fs'
import { Response, ChecksListForSuiteResponse, ChecksCreateParams} from '@octokit/rest';
import * as fs from 'fs';
import {getWorkflows, getChecksForSuite, asArray} from './Util';
import * as util from './Util';

import {Toposort} from './Toposort';

import {OpenshiftClientTool as oc} from './OpenshiftClientTool'
import { GitHubAPI } from 'probot/lib/github';
import { Workflows, Job, Checkrun } from './Model';

//import * as child_process from 'child_process';

export = (app: Application) => {
  app.on('job.run', async (context) => {
    const job:Job =context.payload.job;
    const check_run:Checkrun = context.payload.check_run;

    await context.github.checks.update({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      check_run_id: check_run.id,
      status: 'in_progress'
    });

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
      app.log(`job.run - job:${job.name} step=${step.name}, image=${dockerImageUri}`);
      if (dockerImageUri){
        const podName = `${job.id}-${step.id}`
        const args = ['--namespace=csnr-devops-lab-tools', 'run', `${podName}`, `--image=${dockerImageUri}`, '--labels=workflow=true', '--command=true', '-it', '--wait=true', '--restart=Never', '--']
        args.push(...util.asArray(step.run))
        args.push(...util.asArray(step.args))
        app.log(...args)
        let logPath = `/tmp/check_run_${podName}.log.txt`
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
      conclusion: 'success'
    });

  });
  app.on(['check_run.created', 'check_run.completed'], async (context) => {
    app.log(`${context.event}.${context.payload.action} - ${context.payload.check_run.head_sha}`);
    const workflows:Workflows = await getWorkflows(context, context.payload.repository, context.payload.check_run.head_sha);
    //const check_run = context.payload.check_run;
    //const job = util.getJobFromCheckrun(workflows, context.payload.check_run);
    const runIfReady = async (check_run:Checkrun) : Promise<boolean> => {
      const ret:boolean = false;
      if (check_run.completed_at != null && check_run.status !== 'in_progress' ){
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
            const payload = {
              action: 'run',
              check_run: check_run,
              repository: context.payload.repository,
              installation: context.payload.installation,
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
        await context.github.checks.create(check_run);
      }
    }

  });
  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
}
