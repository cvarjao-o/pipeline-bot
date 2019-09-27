import { Context } from 'probot' // eslint-disable-line no-unused-vars
import { Response, ChecksGetResponse } from '@octokit/rest';
import { stringLiteral, isClassPrivateMethod } from '@babel/types';
import {Toposort} from './Toposort';
import {Workflows, Workflow, Job, Checkrun, Factory} from './Model';
import { fstat, readdir, readFile} from 'fs';

export function asArray(item:any){
  const array = [];
  if (item != null){
    if (Array.isArray(item)){
      array.push(...item)
    }else{
      array.push(item)
    }
  }
  return array;
}

/**
 * returns 
 * @param workflow 
 * @param context 
 * @returns {string[]} - Returns the actions that needs to run in topological/execution order.
 */
export function listJobs(workflow:Workflow, context:Context) : Job[]{
  const dag = new Toposort();
  for (let job of workflow.jobs.values()) {
    dag.add(job.id as string, asArray(job.needs))
  }
  const jobs:Job[]=[];
  for (let key of dag.sort().reverse()) {
    jobs.push(workflow.jobs.get(key) as Job)
  }
  return jobs;
}

export function canJobBeStarted(job:Job, check_run: Checkrun) : boolean {
  return true;
}
export function getJobFromCheckrun(workflows:Workflow[], check_run: Checkrun) : Job|null {
  for (let workflow of workflows){
    const job:Job|undefined=workflow.jobs.get(check_run.name) as Job;
    if (job!=null){
      return job;
    }
  }
  return null;
}

export function getChecksForSuite(context: Context, repository:any, check_suite_id:number, started_at:string): Promise<Map<string, any>> {
  return context.github.checks.listForSuite({
    owner: repository.owner.login,
    repo: repository.name,
    check_suite_id: check_suite_id,
  }).then(payload => {
    const check_runs: Map<string, any> = new Map();
    for (let check_run of payload.data.check_runs) {
      if (check_run.started_at == started_at){
        check_runs.set(check_run.name, check_run);
      }
    }
    return check_runs
  })
}

export function getAllWorkflows(context: Context, repo:any, head_sha:string): Promise<Workflows> {
  const gitWorkDirectory = `/tmp/.workflows-bot/${repo.full_name}/${head_sha}/.bcgov/workflows`
  return new Promise((resolve, reject)=>{
    readdir(gitWorkDirectory, (err, files)=>{
      const promises=[];
      if (err) throw err;
      for (let file of files){
        promises.push(new Promise(resolve => {
          readFile(`${gitWorkDirectory}/${file}`, 'utf8', function (err, data) {
            if (err) throw err;
            const obj = JSON.parse(data);
            resolve(obj);
          });
        }))
      }
      resolve(promises);
    });
  })
  .then( (promises:any) =>{
    return Promise.all(promises);
    /*
    return promises.reduce((promiseChain:Promise<any>, currentTask:Promise<any>) =>{
      return promiseChain.then((chainResults:any) => {
          currentTask.then((currentResult: any) => {
              return [ ...chainResults, currentResult ];
          })
      });
    }, Promise.resolve([]));
    */
  })
  .then( (items) =>{
    const items2: any[] = [];
    for (let item of items){
      if (Array.isArray(item)){
        items2.push(...item);
      }else{
        items2.push(item);
      }
    }
    return items2;
  })
  .then( (items) =>{
    return Factory.asWorkflows(items as any[]);
  });
  //const json = require('../test/fixtures/main.workflows-v2.json');
  //return Promise.resolve(Factory.asWorkflows(json));
}

export function getWorkflows(context: Context, repo:any, head_sha:string): Promise<Workflows> {
  return getAllWorkflows(context, repo, head_sha).then((allWworkflows)=>{
    const filteredworkflows = new Workflows();
    for (let workflow of allWworkflows){
      if (workflow.on.includes(context.event) || workflow.on.includes(`${context.event}:${context.payload.action}`)){
        filteredworkflows.push(workflow);
      }
    };
    return filteredworkflows
  });
}

/*
export function getCheckrunStatusName(order:number): string {
  if (order == 3){
    return 'completed'
  } else if (order == 1){
    return 'in_progress'
  }else{
    return 'queued';
  }
}
*/

export function getCheckrunStatusOrder(status:string): number {
  if (status == 'completed'){
    return 3;
  }else if (status == 'in_progress'){
    return 2;
  }else { //status == 'queued'
    return 1;
  }
}

export function getCheckrunConclusionOrder(status:string): number {
  switch(status){
    case "success": {
      return 6;
      //break;
    }
    case "neutral": {
      return 5;
      //break;
    }
    case "failure": {
      return 4;
      //break;
    }
    case "timed_out": {
      return 3;
      //break;
    }
    case "cancelled": {
      return 2;
      //break;
    }
    case "action_required": {
      return 1;
      //break;
    }
    default:{
      return 0;
    }
  }
}

export function getNeedsSummary(needs:Map<string, any>): {status:string, conclusion:string} {
  let status: string = 'completed'
  let conclusion: string = ''
  //success, failure, neutral, cancelled, timed_out, action_required
  for (const needed of needs.values()){
    if(needed.status !== 'completed'){
      status = 'in_progress'
    }
    if (needed.conclusion){
      //console.log("conclusion='", conclusion, `' (${getCheckrunConclusionOrder(conclusion)})`, ", needed.conclusion='", needed.conclusion, `' (${getCheckrunConclusionOrder(needed.conclusion)})`)
      if (conclusion === '' || getCheckrunConclusionOrder(needed.conclusion) < getCheckrunConclusionOrder(conclusion)){
        conclusion = needed.conclusion;
      }
    }
  }
  if (conclusion == ''){
    conclusion = 'success'
  }
  if (status !== 'completed'){
    conclusion = ''
  }
  return {status,conclusion};
}

export function resolveNeeds(check_runs:any, action:any): Map<string, any> {
  const result: Map<string, any>= new Map<string, any>()
  const needs:string[] = asArray(action.needs);

  for (let name of needs){
    const check_run_needed = check_runs.get(name);
    if (check_run_needed!=null){
      result.set(name, check_run_needed)
    }else{
      result.set(name, {status:'queued'})
    }
  }

  return result;
}

export function cancel(context: Context, workflow:any, check_runs:any, check_run:any): void {
  //cancel it
  context.github.checks.update({
    owner: context.payload.repository.owner.login,
    repo: context.payload.repository.name,
    check_run_id: check_run.id,
    name: check_run.name,
    status: 'completed',
    conclusion: 'cancelled'
  })
  //cancelDependants(context, workflow, check_runs, check_run)
}
/*
export function cancelDependants(context: Context, workflow:any, check_runs:any, check_run:any): void {
  for (let name of Object.keys(workflow.actions)){
    const dependant = workflow.actions[name]
    if (asArray(dependant.needs).indexOf(check_run.name)>=0){
      cancel(context, workflow, check_runs, check_runs.get(name))
    }
  }
}
*/