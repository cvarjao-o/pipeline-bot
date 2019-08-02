// You can import your modules
// import index from '../src/index'

import nock from 'nock'
// Requiring our app implementation
import myProbotApp from '../src'
import { Probot } from 'probot'
import {spawnSync}  from 'child_process'
import {readFileSync}  from 'fs'
// Requiring our fixtures

nock.disableNetConnect()

describe.skip('GitHub Actions Workflow', () => {
  let probot: any

  test('creates a comment when an issue is opened', async (done) => {
    const makeParser = require('tf-hcl').makeParser;
    const parser = makeParser();
    const workflowFile = readFileSync(__dirname + '/fixtures/main.workflow', {encoding: 'utf-8'})
    parser.feed(workflowFile)
    const results = parser.results[0];
    console.dir(results)
  })
})
