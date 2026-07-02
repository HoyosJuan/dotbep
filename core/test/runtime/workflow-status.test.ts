import { describe, it, expect } from 'vitest'
import type { AutomationAttemptRecord, TransitionRecord } from '../../src/index.js'
import { getWorkflowStatus, createInstance } from '../../src/runtime/transitions.js'
import { ACTOR, buildAutomationChainBep, buildDecisionBep, buildQueryTestBep, externalAsset, instanceAt } from '../helpers.js'

function transitionRecord(toNodeId: string): TransitionRecord {
  return {
    type: 'transition', id: `t-${toNodeId}`, edgeId: 'e', fromNodeId: 'x', toNodeId,
    trigger: { eventId: 'go', actor: ACTOR }, actor: ACTOR, timestamp: new Date().toISOString(),
  }
}

function attemptRecord(nodeId: string, automationId: string, success: boolean, error?: string): AutomationAttemptRecord {
  return { type: 'automationAttempt', id: `a-${nodeId}-${Math.random()}`, nodeId, automationId, success, error, timestamp: new Date().toISOString() }
}

describe('getWorkflowStatus', () => {
  it('awaitingAction — reports transitions and raw RACI ids at a process node, nothing pre-resolved', () => {
    const { bep, workflowId, roleId, otherRoleId } = buildQueryTestBep()
    const { instance } = createInstance(bep.data, workflowId, externalAsset(), ACTOR)!

    const status = getWorkflowStatus(bep.data, instance)

    expect(status.type).toBe('awaitingAction')
    if (status.type !== 'awaitingAction') throw new Error('expected awaitingAction')

    expect(status.instanceId).toBe(instance.id)
    expect(status.workflowId).toBe(workflowId)
    expect(status.currentNodeId).toBe('byRole')
    expect(status.trackedAsset).toEqual(instance.trackedAsset)

    expect(status.transitions).toEqual([
      { edgeId: 'e2', emits: 'go', label: undefined, requiredPayload: [] },
    ])
    expect(status.raci.responsible).toEqual({ roleIds: [roleId], teamIds: [], emails: [] })
    expect(status.raci.accountable).toEqual({ roleIds: [otherRoleId], teamIds: [], emails: [] })
    expect(status.raci.consulted).toEqual({ roleIds: [], teamIds: [], emails: [] })
    expect(status.raci.informed).toEqual({ roleIds: [], teamIds: [], emails: [] })
  })

  it('automationPending — zero failed attempts right after arrival', () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const instance = instanceAt(workflowId, 'auto1', { history: [transitionRecord('auto1')] })

    const status = getWorkflowStatus(bep.data, instance)

    expect(status.type).toBe('automationPending')
    if (status.type !== 'automationPending') throw new Error('expected automationPending')
    expect(status.automation).toEqual({ id: 'first', failedAttemptsSinceArrival: 0, lastError: undefined })
  })

  it('automationPending — counts failed attempts and surfaces the most recent error', () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const instance = instanceAt(workflowId, 'auto1', {
      history: [
        transitionRecord('auto1'),
        attemptRecord('auto1', 'first', false, 'ACC API timeout'),
        attemptRecord('auto1', 'first', false, 'ACC API timeout again'),
      ],
    })

    const status = getWorkflowStatus(bep.data, instance)

    expect(status.type).toBe('automationPending')
    if (status.type !== 'automationPending') throw new Error('expected automationPending')
    expect(status.automation).toEqual({ id: 'first', failedAttemptsSinceArrival: 2, lastError: 'ACC API timeout again' })
  })

  it('automationPending — only counts attempts since the most recent arrival, not earlier visits to the same node', () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const instance = instanceAt(workflowId, 'auto1', {
      history: [
        transitionRecord('auto1'),                               // 1st arrival
        attemptRecord('auto1', 'first', false, 'first visit failure'),
        attemptRecord('auto1', 'first', false, 'first visit failure'),
        transitionRecord('auto1'),                               // 2nd arrival (looped back)
        attemptRecord('auto1', 'first', false, 'second visit failure'),
      ],
    })

    const status = getWorkflowStatus(bep.data, instance)

    expect(status.type).toBe('automationPending')
    if (status.type !== 'automationPending') throw new Error('expected automationPending')
    expect(status.automation).toEqual({ id: 'first', failedAttemptsSinceArrival: 1, lastError: 'second visit failure' })
  })

  it('stranded — parked on a decision node (an invalid resting state)', () => {
    const { bep, workflowId } = buildDecisionBep()
    const instance = instanceAt(workflowId, 'decision')

    const status = getWorkflowStatus(bep.data, instance)

    expect(status).toEqual({
      type: 'stranded',
      instanceId: instance.id,
      workflowId,
      trackedAsset: instance.trackedAsset,
      currentNodeId: 'decision',
    })
  })

  it('completed — no transitions, raci, or automation fields', () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const instance = instanceAt(workflowId, 'end', { status: 'completed' })

    const status = getWorkflowStatus(bep.data, instance)

    expect(status).toEqual({
      type: 'completed',
      instanceId: instance.id,
      workflowId,
      trackedAsset: instance.trackedAsset,
      currentNodeId: 'end',
    })
  })

  it('cancelled — no transitions, raci, or automation fields, regardless of where it stopped', () => {
    const { bep, workflowId } = buildQueryTestBep()
    const instance = instanceAt(workflowId, 'byTeam', { status: 'cancelled' })

    const status = getWorkflowStatus(bep.data, instance)

    expect(status).toEqual({
      type: 'cancelled',
      instanceId: instance.id,
      workflowId,
      trackedAsset: instance.trackedAsset,
      currentNodeId: 'byTeam',
    })
  })
})
