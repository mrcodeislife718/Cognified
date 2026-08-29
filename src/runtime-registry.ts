export type RuntimeFamily = 'webxr' | 'openxr' | 'mobile' | 'desktop' | 'instrumented-tool' | 'other';

export type RuntimeCapability =
  | '6dof-head'
  | '6dof-hands'
  | 'eye-tracking'
  | 'haptics'
  | 'spatial-mesh'
  | 'passthrough'
  | 'controller-input'
  | 'camera'
  | 'audio'
  | 'tool-telemetry';

export type RuntimeDescriptor = {
  id: string;
  family: RuntimeFamily;
  version: string;
  capabilities: RuntimeCapability[];
  supportedSkillIRVersionRange: string;
  observationSchemaVersion: string;
  available: boolean;
  measuredLatencyMs?: number;
};

export type RuntimeRequirement = {
  requiredCapabilities: RuntimeCapability[];
  preferredFamilies?: RuntimeFamily[];
  maxMeasuredLatencyMs?: number;
};

export class RuntimeRegistry {
  private readonly runtimes = new Map<string, RuntimeDescriptor>();

  register(runtime: RuntimeDescriptor): void {
    if (!runtime.id || !runtime.version || !runtime.supportedSkillIRVersionRange || !runtime.observationSchemaVersion) throw new Error('Runtime identity and compatibility declarations are required');
    if (runtime.measuredLatencyMs !== undefined && (!Number.isFinite(runtime.measuredLatencyMs) || runtime.measuredLatencyMs < 0)) throw new Error('Runtime latency must be non-negative');
    if (new Set(runtime.capabilities).size !== runtime.capabilities.length) throw new Error('Duplicate runtime capabilities');
    this.runtimes.set(runtime.id, structuredClone(runtime));
  }

  setAvailability(runtimeId: string, available: boolean): void {
    const runtime = this.require(runtimeId);
    runtime.available = available;
  }

  resolve(requirement: RuntimeRequirement): RuntimeDescriptor[] {
    const preferred = requirement.preferredFamilies ?? [];
    return [...this.runtimes.values()]
      .filter((runtime) => runtime.available)
      .filter((runtime) => requirement.requiredCapabilities.every((capability) => runtime.capabilities.includes(capability)))
      .filter((runtime) => requirement.maxMeasuredLatencyMs === undefined || (runtime.measuredLatencyMs ?? Number.POSITIVE_INFINITY) <= requirement.maxMeasuredLatencyMs)
      .sort((a, b) => {
        const ai = preferred.indexOf(a.family);
        const bi = preferred.indexOf(b.family);
        const ap = ai < 0 ? Number.POSITIVE_INFINITY : ai;
        const bp = bi < 0 ? Number.POSITIVE_INFINITY : bi;
        if (ap !== bp) return ap - bp;
        return (a.measuredLatencyMs ?? Number.POSITIVE_INFINITY) - (b.measuredLatencyMs ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id);
      })
      .map((runtime) => structuredClone(runtime));
  }

  requireCompatible(requirement: RuntimeRequirement): RuntimeDescriptor {
    const [runtime] = this.resolve(requirement);
    if (!runtime) throw new Error('No compatible runtime available');
    return runtime;
  }

  private require(id: string): RuntimeDescriptor {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error(`Unknown runtime: ${id}`);
    return runtime;
  }
}
