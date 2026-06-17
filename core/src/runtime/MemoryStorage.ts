import type { InstanceStore, WorkflowInstance, InstanceFilter } from './types.js'

/**
 * In-memory InstanceStore implementation.
 * Default storage for local development and testing.
 * State is lost when the process exits.
 */
export class MemoryStorage implements InstanceStore {
  private readonly instances = new Map<string, WorkflowInstance>()

  async listInstances(filter?: InstanceFilter): Promise<WorkflowInstance[]> {
    let results = [...this.instances.values()]
    if (filter?.workflowId)    results = results.filter(i => i.workflowId === filter.workflowId)
    if (filter?.status)        results = results.filter(i => i.status === filter.status)
    if (filter?.trackedAssetId) results = results.filter(i => i.trackedAsset.source === 'internal' && i.trackedAsset.id === filter.trackedAssetId)
    return results
  }

  async getInstance(instanceId: string): Promise<WorkflowInstance | null> {
    return this.instances.get(instanceId) ?? null
  }

  async saveInstance(instance: WorkflowInstance): Promise<void> {
    this.instances.set(instance.id, instance)
  }

  async deleteInstance(instanceId: string): Promise<void> {
    this.instances.delete(instanceId)
  }
}
