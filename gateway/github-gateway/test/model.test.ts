import * as model from '../src/Model';
import fixture from './fixtures/workflows'

describe('model', () => {
  test('create', async (done) => {
    const workflow:model.Workflow = fixture[0];
    expect(workflow).toBeInstanceOf(model.Workflow);
    expect(workflow.jobs).toBeInstanceOf(model.Jobs);
    expect(workflow.jobs.size).toBe(1);
    workflow.jobs.forEach((job, key) => {
      expect(job).toBeInstanceOf(model.Job);
      expect(job.id).toBe(key);
      expect(job.steps.length).toBe(1)
      job.steps.forEach((step) => {
        expect(step.uses).toBeDefined()
        expect(step.run).toBeDefined()
      })
    });
    done()
  })
})