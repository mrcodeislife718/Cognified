BEGIN;

CREATE TABLE IF NOT EXISTS cognified_skills (
  skill_id text NOT NULL,
  skill_version text NOT NULL,
  title text NOT NULL,
  fingerprint text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (skill_id, skill_version),
  UNIQUE (fingerprint)
);

CREATE TABLE IF NOT EXISTS cognified_runtime_descriptors (
  runtime_id text PRIMARY KEY,
  family text NOT NULL CHECK (family IN ('webxr','openxr','mobile','desktop','instrumented-tool','other')),
  runtime_version text NOT NULL,
  capabilities text[] NOT NULL,
  supported_skill_ir_version_range text NOT NULL,
  observation_schema_version text NOT NULL,
  available boolean NOT NULL,
  measured_latency_ms double precision CHECK (measured_latency_ms IS NULL OR measured_latency_ms >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cognified_learner_twins (
  learner_id text NOT NULL,
  skill_id text NOT NULL,
  skill_version text NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (learner_id, skill_id, skill_version),
  FOREIGN KEY (skill_id, skill_version) REFERENCES cognified_skills(skill_id,skill_version) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cognified_twins_skill_idx ON cognified_learner_twins(skill_id,skill_version,updated_at);

CREATE TABLE IF NOT EXISTS cognified_sessions (
  session_id text PRIMARY KEY,
  learner_id text NOT NULL,
  skill_id text NOT NULL,
  skill_version text NOT NULL,
  runtime_id text NOT NULL REFERENCES cognified_runtime_descriptors(runtime_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('active','completed','cancelled')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  FOREIGN KEY (skill_id, skill_version) REFERENCES cognified_skills(skill_id,skill_version) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS cognified_one_active_session_per_skill_idx
  ON cognified_sessions(learner_id,skill_id,skill_version) WHERE status='active';
CREATE INDEX IF NOT EXISTS cognified_sessions_status_idx ON cognified_sessions(status,started_at);

CREATE TABLE IF NOT EXISTS cognified_evidence_keys (
  key_id text PRIMARY KEY,
  signer_id text NOT NULL,
  public_key_pem text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','revoked')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE INDEX IF NOT EXISTS cognified_evidence_keys_signer_idx ON cognified_evidence_keys(signer_id,status,valid_from);

CREATE TABLE IF NOT EXISTS cognified_practice_decisions (
  id uuid PRIMARY KEY,
  session_id text NOT NULL REFERENCES cognified_sessions(session_id) ON DELETE RESTRICT,
  primitive_id text NOT NULL,
  challenge_id text NOT NULL,
  expected_gain double precision NOT NULL,
  safety_score double precision NOT NULL,
  decision_payload jsonb NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cognified_practice_session_idx ON cognified_practice_decisions(session_id,decided_at);

CREATE TABLE IF NOT EXISTS cognified_certificates (
  certificate_id uuid PRIMARY KEY,
  learner_id text NOT NULL,
  skill_id text NOT NULL,
  skill_version text NOT NULL,
  assessment_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('verified','insufficient-evidence')),
  certificate_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  FOREIGN KEY (skill_id, skill_version) REFERENCES cognified_skills(skill_id,skill_version) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cognified_certificates_lookup_idx ON cognified_certificates(learner_id,skill_id,skill_version,assessment_id,created_at);

COMMIT;
