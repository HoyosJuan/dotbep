import type { InstanceStore, WorkflowInstance } from './types.js'

/**
 * In-memory InstanceStore implementation.
 * Default storage for local development and testing.
 * State is lost when the process exits.
 */
export class MemoryStorage implements InstanceStore {
  private readonly instances = new Map<string, WorkflowInstance>()

  async listInstances(): Promise<WorkflowInstance[]> {
    return [...this.instances.values()]
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
