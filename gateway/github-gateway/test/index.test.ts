// You can import your modules
// import index from '../src/index'

import nock from 'nock'
// Requiring our app implementation
import myProbotApp from '../src'
import { Probot, Application, Context} from 'probot'
// Requiring our fixtures
import payload from './fixtures/issues.opened.json'
const issueCreatedBody = { body: 'Thanks for opening this issue!' }
import * as child_process from 'child_process'

nock.disableNetConnect()
import * as util from '../src/Util';
import {OpenshiftClientTool as oc} from '../src/OpenshiftClientTool'
import { GitHubStub } from './GithubStub';
import { CLIENT_RENEG_WINDOW } from 'tls';
//jest.mock('../src/Util')
const workflowFile = require('./fixtures/main.workflow.json')
const mockSpawn = require('mock-spawn');


function expected_checkruns(workflow:any, context:any) : Map<string,any> {
  const expected_actions = util.listActions(workflowFile, (context as unknown) as Context)
  const check_runs:Map<string,any> = new Map();
  for (let expected_action of expected_actions){
    check_runs.set(expected_action, null);
  }
  return check_runs
}

describe('My Probot app', () => {
  let probot:Probot
  let app:Application
  let getWorkflowMock: any

  beforeEach(() => {
    getWorkflowMock = jest.spyOn(util, 'getWorkflow');
    //getWorkflowMock.mockImplementation(() => {
    //  return Promise.resolve(workflowFile)
    //})
    probot = new Probot({ id: 123, cert: 'test' })
    // Load our app into probot
    app = probot.load(myProbotApp)

    // just return a test token
    app.app = () => 'test'
    app.log("Starting test ...");
  })

  afterEach((done) => {
    setTimeout(() => {
      app.log("Test ended.");
      jest.restoreAllMocks()
      nock.cleanAll()
      done()
    }, 1000)
  })

  test.skip('creates a comment when an issue is opened', async (done) => {
    // Test that we correctly return a test token
    nock('https://api.github.com')
      .post('/app/installations/2/access_tokens')
      .reply(200, { token: 'test' })

    // Test that a comment is posted
    nock('https://api.github.com')
      .post('/repos/hiimbex/testing-things/issues/1/comments', (body: any) => {
        done(expect(body).toMatchObject(issueCreatedBody))
        return true
      })
      .reply(200)

    // Receive a webhook event
    await probot.receive({ name: 'issues', payload })
  })
  test.skip('Start Check-runs when pull-request is open - success 1', async (done) => {
    const ocMock = jest.spyOn(oc, 'spawn');
    ocMock.mockImplementation((args: string[], options?: child_process.SpawnOptions) => {
      const mock = mockSpawn();
      mock.setDefault(mock.simple(0, 'hello world'));
      return mock('oc', args, options)
    })

    const pull_request_payload = require('./fixtures/pull_request.opened.json')
    const check_runs = expected_checkruns(workflowFile, {event:'pull_request', payload:{action:'opened'}});
    GitHubStub.setupPullRequest(app, workflowFile, pull_request_payload, check_runs, ()=>{
      done()
    });
    
    // Receive a webhook event
    await probot.receive({ name: 'pull_request', payload: pull_request_payload })
  }, 600000)

  test('Start Check-runs when pull-request is open - success 2', async (done) => {
    const ocMock = jest.spyOn(oc, 'spawn');
    ocMock.mockImplementation((args: string[], options?: child_process.SpawnOptions) => {
      const mock = mockSpawn();
      mock.setDefault(mock.simple(0, 'hello world'));
      return mock('oc', args, options)
    })

    const check_runs = expected_checkruns(workflowFile, {event:'pull_request', payload:{action:'opened'}});
    const pull_request_payload = require('./fixtures/pull_request.opened.json')
    GitHubStub.setupPullRequest(app, workflowFile, pull_request_payload, check_runs, ()=>{
      expect(check_runs.get('deploy-to-prod')).toHaveProperty('status', 'completed')
      expect(check_runs.get('deploy-to-prod')).toHaveProperty('conclusion', 'success')
      done()
    });
    
    // Receive a webhook event
    await probot.receive({ name: 'pull_request', payload: pull_request_payload })
  }, 600000)

  test('Start Check-runs when pull-request is open - fail', async (done) => {
    const ocMock = jest.spyOn(oc, 'spawn');
    ocMock.mockImplementation((args: string[], options?: child_process.SpawnOptions) => {
      const mock = mockSpawn();
      mock.setDefault(mock.simple(1 , 'hello world' ));
      return mock('oc', args, options)
    });
    const check_runs = expected_checkruns(workflowFile, {event:'pull_request', payload:{action:'opened'}});
    const pull_request_payload = require('./fixtures/pull_request.opened.json')
    GitHubStub.setupPullRequest(app, workflowFile, pull_request_payload, check_runs, ()=>{
      expect(check_runs.get('build')).toHaveProperty('status', 'completed')
      expect(check_runs.get('build')).toHaveProperty('conclusion', 'failure')

      expect(check_runs.get('deploy-to-prod')).toHaveProperty('status', 'completed')
      expect(check_runs.get('deploy-to-prod')).toHaveProperty('conclusion', 'cancelled')
      done()
    });
    
    // Receive a webhook event
    await probot.receive({ name: 'pull_request', payload: pull_request_payload })
    //done()
  }, 600000);
  // Re-run when there is a previously known check_run in a sucessfull or failed state
  test.todo("rerun");
})

// For more information about testing with Jest see:
// https://facebook.github.io/jest/

// For more information about using TypeScript in your tests, Jest recommends:
// https://github.com/kulshekhar/ts-jest

// For more information about testing with Nock see:
// https://github.com/nock/nock
