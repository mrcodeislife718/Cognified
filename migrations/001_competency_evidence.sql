BEGIN;

CREATE TABLE IF NOT EXISTS cognified_competency_evidence (
  id uuid PRIMARY KEY,
  learner_id text NOT NULL,
  skill_id text NOT NULL,
  skill_version text NOT NULL,
  primitive_id text NOT NULL,
  assessment_id text,
  context_id text NOT NULL,
  runtime_id text NOT NULL,
  evidence_class text NOT NULL CHECK (evidence_class IN ('behavioral','physiological','neural')),
  evidence_artifact_ids text[] NOT NULL CHECK (cardinality(evidence_artifact_ids) > 0),
  metrics jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  protocol_version text NOT NULL,
  signer_id text NOT NULL,
  previous_hash text NOT NULL,
  hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cognified_evidence_learner_skill_idx
  ON cognified_competency_evidence(learner_id, skill_id, skill_version, observed_at);
CREATE INDEX IF NOT EXISTS cognified_evidence_primitive_idx
  ON cognified_competency_evidence(skill_id, skill_version, primitive_id, observed_at);
CREATE INDEX IF NOT EXISTS cognified_evidence_context_idx
  ON cognified_competency_evidence(skill_id, skill_version, context_id, observed_at);

COMMIT;
