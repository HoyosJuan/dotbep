import type { InstanceStore, WorkflowInstance, InstanceFilter } from './types.js'

/**
 * In-memory InstanceStore implementation.
 * Default storage for local development and testing.
 * State is lost when the process exits.
 */
export class MemoryStorage implements InstanceStore {
  private readonly instances = new Map<string, WorkflowInstance>()

  async listInstances(_projectId: string, filter?: InstanceFilter): Promise<WorkflowInstance[]> {
    let results = [...this.instances.values()]
    if (filter?.workflowId)    results = results.filter(i => i.workflowId === filter.workflowId)
    if (filter?.status)        results = results.filter(i => i.status === filter.status)
    if (filter?.trackedAssetTypeId) results = results.filter(i => i.trackedAsset.assetTypeId === filter.trackedAssetTypeId)
    if (filter?.trackedAssetId)     results = results.filter(i => i.trackedAsset.id === filter.trackedAssetId)
    return results
  }

  async getInstance(_projectId: string, instanceId: string): Promise<WorkflowInstance | null> {
    return this.instances.get(instanceId) ?? null
  }

  async saveInstance(_projectId: string, instance: WorkflowInstance): Promise<void> {
    this.instances.set(instance.id, instance)
  }

  async deleteInstance(_projectId: string, instanceId: string): Promise<void> {
    this.instances.delete(instanceId)
  }
}
