export type EvidenceSource = {
  id: string;
  title: string;
  uri?: string;
  authority: 'primary' | 'secondary' | 'user';
  confidence: number;
};

export type SkillNode = {
  id: string;
  title: string;
  description: string;
  prerequisites: string[];
  concepts: string[];
  procedures: string[];
  evidenceIds: string[];
  difficulty: number;
};

export type SkillGraph = {
  id: string;
  title: string;
  version: string;
  nodes: SkillNode[];
  evidence: EvidenceSource[];
};

export type LearningEvent = {
  learnerId: string;
  skillId: string;
  nodeId: string;
  kind: 'recall' | 'recognition' | 'procedure' | 'transfer' | 'error-detection';
  correct: boolean;
  responseMs: number;
  confidence: number;
  assistanceUsed: boolean;
  timestamp: string;
};

export type CompetencyScore = {
  learnerId: string;
  skillId: string;
  overall: number;
  recall: number;
  procedure: number;
  transfer: number;
  errorDetection: number;
  confidenceCalibration: number;
  assistanceDependency: number;
  evidenceCount: number;
};

export type Experience = {
  id: string;
  nodeId: string;
  mode: 'explain' | 'demonstrate' | 'practice' | 'retrieve' | 'transfer';
  prompt: string;
  objective: string;
};
