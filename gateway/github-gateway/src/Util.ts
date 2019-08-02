import { Context } from 'probot' // eslint-disable-line no-unused-vars
import { Response } from '@octokit/rest';
import { stringLiteral, isClassPrivateMethod } from '@babel/types';
import {Toposort} from './Toposort';

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
export function listActions(workflow:any, context:Context) : string[]{
  const actions : string[] = []
  const dag = new Toposort();
  for (let key of Object.keys(workflow.workflow)) {
    let flow = workflow.workflow[key];
    let triggers = asArray(flow.on);
    for (let trigger of triggers) {
      if (trigger == context.event || trigger == `${context.event}:${context.payload.action}`){
        actions.push(...asArray(flow.resolves))
        for (let action of asArray(flow.resolves)) {
          dag.add(action, asArray(workflow.actions[action].needs))
        }
        break;
      }
    }
  }

  //Iterate over all picked actions and include any dependency (needed)
  let changed = true
  while(changed){
    const original_length = actions.length
    for (let key of actions) {
      const item = workflow.actions[key]
      for (let needed of asArray(item.needs)) {
        if (actions.indexOf(needed)<0){
          actions.unshift(needed)
          dag.add(needed, asArray(workflow.actions[needed].needs))
        }
      }
    }
    changed = actions.length !== original_length
  }
  return dag.sort().reverse()
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

export function getWorkflow(context: Context, repo:any, head_sha:string): Promise<any> {
  return require('../test/fixtures/main.workflow.json');
  /* 
  return context.github.repos.getContents({
    owner: repo.owner.login,
    repo: repo.name,
    path: '.github/main.workflow.json',
    ref: head_sha})
    .then(async (response: Response<any>)=>{
      const workflow =  JSON.parse(Buffer.from(response.data.content, response.data.encoding).toString('utf-8'))
      return workflow;
    }); */
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