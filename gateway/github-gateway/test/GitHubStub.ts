import nock from 'nock';
import { Probot, Application} from 'probot';
import * as util from '../src/Util';

export class GitHubStub {
  public static setupPullRequest(app:Application, workflowFile:any, pull_request_payload:any, check_runs: Map<string, any>, done:CallableFunction): void {
    const pull_request_head_sha = pull_request_payload.pull_request.head.sha
    // Test that we correctly return a test token
    nock('https://api.github.com')
      .post('/app/installations/2/access_tokens')
      .reply(200, { token: 'test' });
    
    nock('https://api.github.com')
    .get(`/repos/${pull_request_payload.repository.full_name}/contents/.github/main.workflow.json`)
    .query({ref: pull_request_head_sha})
    .reply(200, {type: "file", encoding: "base64", content:Buffer.from(JSON.stringify(workflowFile), 'utf-8').toString('base64')})
    .persist();

    const check_suite = {id: 154204399, head_sha:pull_request_head_sha, status: 'queued'}
    //const check_runs = new Map()
    const names = Object.keys(workflowFile.actions);

    nock('https://api.github.com')
    .post(`/repos/${pull_request_payload.repository.full_name}/check-runs`)
    .reply(200,  async (uri: any, requestBody: any) => {
      
      const req = JSON.parse(requestBody)
      const name = req.name
      const index = names.indexOf(name)
      const result = Object.assign({id:index, status: 'queued', check_suite: check_suite}, req)
      check_runs.set(name, result)
      app.log(`Creating check_run {"name": "${result.name}", id: "${result.id}"}`)
      //process.nextTick(async () => {
        await app.receive({ name: 'check_run', payload: {action: 'created', check_run: result, repository: pull_request_payload.repository, organization: pull_request_payload.organization, sender: pull_request_payload.sender, installation: pull_request_payload.installation} })
      //})
      return result
    })
    .persist()

    for (let name of names){
      const index = names.indexOf(name)
      nock('https://api.github.com')
      .patch(`/repos/${pull_request_payload.repository.full_name}/check-runs/${index}`)
      .reply(200, async (uri: any, requestBody: any) => {
        const check_run = check_runs.get(name);
        const patch = JSON.parse(requestBody);
        app.log(`Patching check_run {name: '${name}'}`)
        const current_status = check_run.status;
        const new_status = patch.status || check_run.status || 'queued';
        const new_conclusion = patch.conclusion || check_run.conclusion || '';

        Object.assign(check_run, patch);

        app.log(`checkrun[${name}] = {current_status: '${current_status}', new_status: '${new_status}', conclusion: '${new_conclusion}'}`);

        if (new_status === 'completed' && current_status !== 'completed'){
          //process.nextTick(() => {
            await app.receive({ name: 'check_run', payload: {action: 'completed', check_run: check_run, repository: pull_request_payload.repository, organization: pull_request_payload.organization, sender: pull_request_payload.sender, installation: pull_request_payload.installation} })
            let all_done=true
            for (let check_run of check_runs.values()){
              if ((check_run || {}).status != 'completed' ){
                all_done=false
                break;
              }
            }
          //})
          //name === 'approve-deployment-to-prod'
          app.log(`checkrun[${name}] ... finalizing`)
          
          //Look for dependent actions and automatically trigger approval/success input
          for ( const actionName of names){
            const action = workflowFile.actions[actionName]
            const needs = util.asArray(action.needs)
            for ( let needed of needs){
              //app.log(`Checking if ${actionName} which needs "${needed}" is "${check_run.name}"`)
              if (check_run.name === needed && action.action && (check_run.conclusion === 'success' || check_run.conclusion === 'neutral')){
                //setTimeout(function () {
                  for ( let inputName of Object.keys(action.action)){
                    const input = action.action[inputName]
                    if (input.conclusion === 'success'){
                      app.log(`checkrun[${name}]  -> triggering action:${actionName}, input:${inputName}`)
                      await app.receive({ name: 'check_run', payload: {action: 'requested_action', check_run: check_runs.get(actionName), requested_action: {identifier:inputName}, repository: pull_request_payload.repository, organization: pull_request_payload.organization, sender: pull_request_payload.sender, installation: pull_request_payload.installation} })
                    }
                  }
                //}, 3000);
              }
            }
          }

          if (all_done){
            process.nextTick(() => {
              //TODO: here
              done()
            })
          }
        }
        
        return Object.assign({}, check_run)
      }).persist();

      nock('https://api.github.com')
      .get(`/repos/${pull_request_payload.repository.full_name}/check-runs/${index}`)
      .reply(200, (uri: any, requestBody: any) => {
        const check_run = check_runs.get(name);
        return Object.assign({}, check_run)
      }).persist();
    };

    nock('https://api.github.com')
    .get(`/repos/${pull_request_payload.repository.full_name}/check-suites/${check_suite.id}/check-runs`)
    .reply(200, ()=> {
      const result: any[] = []
      for (let check_run of check_runs.values()){
        if (check_run != null){
          result.push(check_run)
        }
      }
      return {check_runs: result}
    }).persist()
    
  }
}