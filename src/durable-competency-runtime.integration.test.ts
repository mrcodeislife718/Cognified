import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { applyCognifiedMigrations } from './migrations.js';
import { PostgresRuntimeStateStore } from './postgres-runtime-state.js';
import { PostgresCompetencyEvidenceStore } from './postgres-competency-evidence.js';
import { DurableCognifiedCompetencyRuntime } from './durable-competency-runtime.js';
import { CompetencyEvidenceAttestationRegistry } from './evidence-attestation.js';

const databaseUrl = process.env.DATABASE_URL;

test('durable Cognified runtime survives restart and certifies only signed retained transfer evidence', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8 });
  try {
    await applyCognifiedMigrations(pool);
    await pool.query(`TRUNCATE
      cognified_certificates,cognified_practice_decisions,cognified_evidence_attestations,
      cognified_sessions,cognified_learner_twins,cognified_runtime_descriptors,
      cognified_evidence_keys,cognified_competency_evidence,cognified_skills
      RESTART IDENTITY CASCADE`);

    const state = new PostgresRuntimeStateStore(pool);
    const evidence = new PostgresCompetencyEvidenceStore({ pool });
    const runtime = new DurableCognifiedCompetencyRuntime(state,evidence);
    await runtime.registerSkill({
      id:'skill:assembly',title:'Assembly skill',version:'1.0.0',sourceEvidenceIds:['source:1'],
      primitives:[
        { id:'p1',kind:'cognitive',title:'Identify parts',description:'Identify all required parts.',prerequisites:[],successCriteria:['all parts correct'],expectedErrorIds:['e1'] },
        { id:'p2',kind:'motor',title:'Execute assembly',description:'Execute the validated assembly sequence.',prerequisites:['p1'],successCriteria:['sequence within tolerance'],expectedErrorIds:['e1'] },
      ],
      constraints:[{ id:'c1',type:'sequence',description:'Sequence remains valid.',hard:true }],
      errorModes:[{ id:'e1',description:'Sequence mismatch',severity:'major',detectableSignals:['sequence-mismatch'],remediationPrimitiveIds:['p1','p2'] }],
      contexts:[{ id:'ctx:baseline',label:'Baseline',variables:{ environment:'baseline' } },{ id:'ctx:transfer',label:'Transfer',variables:{ environment:'novel' } }],
      assessments:[{ id:'assessment:1',primitiveIds:['p1','p2'],contextIds:['ctx:baseline','ctx:transfer'],requiresIndependence:true,requiresTransfer:true,requiresDelayedRetention:true }],
    });
    await runtime.registerRuntime({ id:'openxr:prod',family:'openxr',version:'1.1',capabilities:['6dof-head','controller-input'],supportedSkillIRVersionRange:'^1',observationSchemaVersion:'1',available:true,measuredLatencyMs:9 });

    const { publicKey,privateKey } = generateKeyPairSync('ed25519');
    const publicKeyPem=publicKey.export({type:'spki',format:'pem'}).toString();
    const privateKeyPem=privateKey.export({type:'pkcs8',format:'pem'}).toString();
    const key={ keyId:'key:runtime:prod',signerId:'runtime:prod',publicKeyPem,status:'active' as const,validFrom:new Date(Date.now()-60_000).toISOString() };
    await runtime.registerEvidenceKey(key);

    const sessionId=`session:${Date.now()}`;
    await runtime.beginSession(sessionId,'learner:1','skill:assembly','1.0.0',{requiredCapabilities:['6dof-head','controller-input'],preferredFamilies:['openxr']});
    const decision=await runtime.choosePractice(sessionId,[{ id:'challenge:1',primitiveId:'p2',difficulty:0.3,speedPressure:0.2,complexity:0.3,assistance:0.5,contextNovelty:0.1,distraction:0,physicalLoad:0.1,safetyRisk:0.05,prerequisiteIds:[] }]);
    assert.equal(decision.challengeId,'challenge:1');

    const observedAt=new Date(Date.now()+1000).toISOString();
    const twin=await runtime.observeLearning(sessionId,{ primitiveId:'p2',correctness:0.9,speedScore:0.8,varianceScore:0.9,assistanceUsed:0.1,confidence:0.85,retentionEvidence:0.8,transferEvidence:0.8,automaticityEvidence:0.72,evidenceReliability:0.95,observedAt });
    assert.equal(twin.primitives.p2.observations,1);

    const baseline=await runtime.recordCompetencyEvidence(sessionId,{ primitiveId:'p2',assessmentId:'assessment:1',contextId:'ctx:baseline',evidenceClass:'behavioral',evidenceArtifactIds:['artifact:baseline'],metrics:{performance:0.9},observedAt:new Date(Date.now()+2000).toISOString(),protocolVersion:'1',signerId:'runtime:prod' });
    const transfer=await runtime.recordCompetencyEvidence(sessionId,{ primitiveId:'p2',assessmentId:'assessment:1',contextId:'ctx:transfer',evidenceClass:'behavioral',evidenceArtifactIds:['artifact:transfer'],metrics:{performance:0.86},observedAt:new Date(Date.now()+3000).toISOString(),protocolVersion:'1',signerId:'runtime:prod' });

    const signing=new CompetencyEvidenceAttestationRegistry();
    signing.registerKey(key);
    const baselineAttestation=signing.signRecord(baseline,key.keyId,privateKeyPem,new Date(Date.now()+4000).toISOString());
    const transferAttestation=signing.signRecord(transfer,key.keyId,privateKeyPem,new Date(Date.now()+5000).toISOString());
    await runtime.acceptEvidenceAttestation(baseline.id,baselineAttestation);
    await runtime.acceptEvidenceAttestation(transfer.id,transferAttestation);

    // Simulate a process restart: reconstruct every service object from PostgreSQL.
    const recoveredState=new PostgresRuntimeStateStore(pool);
    const recoveredEvidence=new PostgresCompetencyEvidenceStore({pool});
    const recovered=new DurableCognifiedCompetencyRuntime(recoveredState,recoveredEvidence);
    const recoveredTwin=(await recoveredState.requireTwin('learner:1','skill:assembly','1.0.0')).twin;
    assert.equal(recoveredTwin.primitives.p2.observations,1);
    assert.equal((await recoveredState.requireSession(sessionId)).status,'active');

    const scores={ performance:0.85,retention:0.8,transfer:0.8,independence:0.9,automaticity:0.72,'error-recovery':0.75 } as const;
    const certificate=await recovered.verifyCompetency('learner:1','skill:assembly','1.0.0','assessment:1',[
      { learnerId:'learner:1',skillId:'skill:assembly',skillVersion:'1.0.0',assessmentId:'assessment:1',contextId:'ctx:baseline',runtimeId:'openxr:prod',performedAt:new Date(Date.now()+6000).toISOString(),delayedFromTrainingMs:86_400_000,scores,assistanceUsed:false,evidenceIds:[baseline.id],protocolVersion:'1' },
      { learnerId:'learner:1',skillId:'skill:assembly',skillVersion:'1.0.0',assessmentId:'assessment:1',contextId:'ctx:transfer',runtimeId:'openxr:prod',performedAt:new Date(Date.now()+7000).toISOString(),delayedFromTrainingMs:172_800_000,scores,assistanceUsed:false,evidenceIds:[transfer.id],protocolVersion:'1' },
    ],{ minimums:{performance:0.7,retention:0.7,transfer:0.7,independence:0.7,automaticity:0.6,'error-recovery':0.6},minimumDistinctContexts:2,minimumTrials:2,requireDelayedRetentionMs:86_400_000 });
    assert.equal(certificate.status,'verified');
    assert.equal(await recoveredEvidence.verifyChain(1),true);
    assert.equal((await recovered.completeSession(sessionId)).status,'completed');
  } finally {
    await pool.end();
  }
});
