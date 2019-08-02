// You can import your modules
// import index from '../src/index'
import {Toposort} from '../src/Toposort'

describe('Toposort', () => {
  test('create', async () => {
    const graph = new Toposort()
    graph.add('A2', ['A1', 'A3'])
    graph.add('A3', ['A1', 'A4'])
    expect(graph.sort().reverse()).toEqual(['A1', 'A4', 'A3', 'A2']);
  })
  test('clear', async () => {
    const graph = new Toposort()
    graph.add('A2', ['A1', 'A3'])
    graph.add('A3', ['A1', 'A4'])
    expect(graph.clear().sort()).toEqual([]);
  })
  test('dependents', async () => {
    const graph = new Toposort()
    graph.add('A2', ['A1', 'A3'])
    graph.add('A3', ['A1', 'A4'])
    expect(graph.dependents()).toEqual(['A2', 'A3']);
  })
  test('dependencies', async () => {
    const graph = new Toposort()
    graph.add('A2', ['A1', 'A3'])
    graph.add('A3', ['A1', 'A4'])
    expect(graph.dependencies()).toEqual(['A1', 'A3', 'A4']);
  })
  test('cyclic', async () => {
    const graph = new Toposort()
    graph.add('A2', ['A1', 'A3'])
    graph.add('A3', ['A1', 'A4'])
    graph.add('A4', ['A3'])
    expect(()=>{
      graph.sort()
    }).toThrow(Error);
  })
  test('create2', async () => {
    const graph = new Toposort()
    expect(()=>{
      graph.add('A2', [({A: 'A1'} as unknown) as string, 'A3'])
      graph.add('A3', ['A1', 'A4'])
      expect(graph.sort().reverse()).toEqual(['A1', 'A4', 'A3', 'A2']);
    }).toThrow(Error);
  })
})

// For more information about testing with Jest see:
// https://facebook.github.io/jest/

// For more information about using TypeScript in your tests, Jest recommends:
// https://github.com/kulshekhar/ts-jest

// For more information about testing with Nock see:
// https://github.com/nock/nock
