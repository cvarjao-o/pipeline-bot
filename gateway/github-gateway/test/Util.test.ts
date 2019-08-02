// You can import your modules
// import index from '../src/index'

import nock from 'nock'
import * as util from '../src/Util';
import { stringLiteral } from '@babel/types';
import {OpenshiftClientTool} from '../src/OpenshiftClientTool'

describe('My Probot app - Util', () => {
  beforeAll(() => {
    nock.disableNetConnect()
  });
  
  afterAll(() => {
    nock.enableNetConnect()
  });

  beforeEach(() => {
  })

  afterEach((done) => {
    setTimeout(() => {
      jest.restoreAllMocks()
      nock.cleanAll()
      done()
    }, 1000)
  })

  test('getNeedsSummary - 1', async () => {
    const check_runs:Map<string,any>= new Map();
    check_runs.set('A1', {status:'completed', conclusion:'success'})
    check_runs.set('A2', {status:'completed', conclusion:'success'})
    check_runs.set('A3', {status:'completed', conclusion:'success'})
    const action = {name:'A3', needs:['A1', 'A2']}
    const needsInfo:Map<string,any> = util.resolveNeeds(check_runs, action)
    expect(needsInfo).toEqual(new Map([['A1', check_runs.get('A1')], ['A2', check_runs.get('A2')]]))
    //console.dir(needsInfo)
    const summary = util.getNeedsSummary(needsInfo)
    //console.dir(needsInfo)
    expect(summary).toEqual({status: 'completed', conclusion: 'success'})
  })

  test('getNeedsSummary - 1a', async () => {
    const check_runs:Map<string,any>= new Map();
    check_runs.set('A1', {status:'completed', conclusion:'success'})
    check_runs.set('A2', {status:'completed', conclusion:'invalid'})
    
    const action = {needs:['A1', 'A2']}
    const needsInfo:Map<string,any> = util.resolveNeeds(check_runs, action)
    expect(needsInfo).toEqual(new Map([['A1', check_runs.get('A1')], ['A2', check_runs.get('A2')]]))
    //console.dir(needsInfo)
    const summary = util.getNeedsSummary(needsInfo)
    //console.dir(needsInfo)
    expect(summary).toEqual({status: 'completed', conclusion: 'invalid'})
  })

  test('getNeedsSummary - 2', async () => {
    const check_runs:Map<string,any>= new Map();
    check_runs.set('A1', {status:'completed', conclusion:'success'})
    check_runs.set('A2', {status:'completed', conclusion:'neutral'})
    check_runs.set('A3', {status:'completed', conclusion:'failure'})
    check_runs.set('A4', {status:'completed', conclusion:'timed_out'})
    check_runs.set('A5', {status:'completed', conclusion:'cancelled'})
    check_runs.set('A6', {status:'completed', conclusion:'action_required'})
    //check_runs.set('A7', {status:'queued', conclusion:''})

    const action = {needs:['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']}
    const needsInfo:Map<string,any> = util.resolveNeeds(check_runs, action)
    
    expect(needsInfo).toEqual(new Map([
      ['A1', check_runs.get('A1')],
      ['A2', check_runs.get('A2')],
      ['A3', check_runs.get('A3')],
      ['A4', check_runs.get('A4')],
      ['A5', check_runs.get('A5')],
      ['A6', check_runs.get('A6')],
      ['A7', {status: 'queued'}],
    ]))
    //console.dir(needsInfo)
    const summary = util.getNeedsSummary(needsInfo)
    //console.dir(needsInfo)
    expect(summary).toEqual({status: 'in_progress', conclusion: ''})
    //expect(summary).toEqual({status: 'completed', conclusion: 'action_required'})
  })
  test('getNeedsSummary - 3', async () => {
    const check_runs:Map<string,any>= new Map();
    check_runs.set('A1', {status:'completed', conclusion:'success'})
    check_runs.set('A2', {status:'completed', conclusion:'success'})
    check_runs.set('A3', {status:'completed', conclusion:'success'})
    const action = {needs:[]}
    const needsInfo:Map<string,any> = util.resolveNeeds(check_runs, action)
    expect(needsInfo).toEqual(new Map())
    //console.dir(needsInfo)
    const summary = util.getNeedsSummary(needsInfo)
    //console.dir(needsInfo)
    expect(summary).toEqual({status: 'completed', conclusion: 'success'})
  })
  test('getCheckrunStatusOrder', async () => {
    expect(util.getCheckrunStatusOrder('completed')).toEqual(3)
    expect(util.getCheckrunStatusOrder('in_progress')).toEqual(2)
    expect(util.getCheckrunStatusOrder('queued')).toEqual(1)
  })
  test('asArray', async () => {
    expect(util.asArray("one")).toEqual(["one"])
    expect(util.asArray(["one"])).toEqual(["one"])
    expect(util.asArray(["one", "two"])).toEqual(["one", "two"])
  })
  test('OpenshiftClientTool.spawn', async (done) => {
    const cmd=OpenshiftClientTool.spawn(['version']);
    cmd.on('close', (code:number) => {
      expect(code).toEqual(0)
      done()
    })
  })
})

// For more information about testing with Jest see:
// https://facebook.github.io/jest/

// For more information about using TypeScript in your tests, Jest recommends:
// https://github.com/kulshekhar/ts-jest

// For more information about testing with Nock see:
// https://github.com/nock/nock
