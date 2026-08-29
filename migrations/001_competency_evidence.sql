BEGIN;

CREATE SEQUENCE IF NOT EXISTS cognified_evidence_sequence;

CREATE TABLE IF NOT EXISTS cognified_competency_evidence (
  id uuid PRIMARY KEY,
  evidence_sequence bigint NOT NULL DEFAULT nextval('cognified_evidence_sequence'),
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

ALTER TABLE cognified_competency_evidence ADD COLUMN IF NOT EXISTS evidence_sequence bigint;
ALTER TABLE cognified_competency_evidence ALTER COLUMN evidence_sequence SET DEFAULT nextval('cognified_evidence_sequence');
UPDATE cognified_competency_evidence SET evidence_sequence=nextval('cognified_evidence_sequence') WHERE evidence_sequence IS NULL;
ALTER TABLE cognified_competency_evidence ALTER COLUMN evidence_sequence SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cognified_evidence_sequence_idx ON cognified_competency_evidence(evidence_sequence);
CREATE INDEX IF NOT EXISTS cognified_evidence_learner_skill_idx
  ON cognified_competency_evidence(learner_id, skill_id, skill_version, evidence_sequence);
CREATE INDEX IF NOT EXISTS cognified_evidence_primitive_idx
  ON cognified_competency_evidence(skill_id, skill_version, primitive_id, evidence_sequence);
CREATE INDEX IF NOT EXISTS cognified_evidence_context_idx
  ON cognified_competency_evidence(skill_id, skill_version, context_id, evidence_sequence);

COMMIT;
