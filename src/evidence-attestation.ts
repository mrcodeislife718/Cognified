import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import type { CompetencyEvidenceRecord } from './competency-evidence.js';

export type TrustedEvidenceKey = {
  keyId: string;
  signerId: string;
  publicKeyPem: string;
  status: 'active' | 'revoked';
  validFrom: string;
  validUntil?: string;
};

export type EvidenceAttestation = {
  recordId: string;
  recordHash: string;
  signerId: string;
  keyId: string;
  algorithm: 'Ed25519';
  signedAt: string;
  signatureBase64: string;
};

const payload = (record: CompetencyEvidenceRecord, signedAt: string): Buffer => Buffer.from(JSON.stringify({ recordId: record.id, recordHash: record.hash, signerId: record.signerId, signedAt }), 'utf8');

export class CompetencyEvidenceAttestationRegistry {
  private readonly keys = new Map<string, TrustedEvidenceKey>();
  private readonly attestations = new Map<string, EvidenceAttestation>();

  registerKey(key: TrustedEvidenceKey): void {
    if (!key.keyId.trim() || !key.signerId.trim() || !key.publicKeyPem.trim()) throw new Error('Trusted key identity and public key are required');
    if (!Number.isFinite(Date.parse(key.validFrom))) throw new Error('validFrom must be a valid timestamp');
    if (key.validUntil !== undefined && (!Number.isFinite(Date.parse(key.validUntil)) || Date.parse(key.validUntil) <= Date.parse(key.validFrom))) throw new Error('validUntil must follow validFrom');
    createPublicKey(key.publicKeyPem);
    const existing = this.keys.get(key.keyId);
    if (existing && (existing.signerId !== key.signerId || existing.publicKeyPem !== key.publicKeyPem)) throw new Error(`Key id is already bound to another identity: ${key.keyId}`);
    this.keys.set(key.keyId, structuredClone(key));
  }

  revokeKey(keyId: string): void {
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Unknown evidence key: ${keyId}`);
    key.status = 'revoked';
  }

  signRecord(record: CompetencyEvidenceRecord, keyId: string, privateKeyPem: string, signedAt = new Date().toISOString()): EvidenceAttestation {
    const key = this.requireUsableKey(keyId, record.signerId, signedAt);
    const privateKey: KeyObject = createPrivateKey(privateKeyPem);
    const derivedPublic = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
    const registeredPublic = createPublicKey(key.publicKeyPem).export({ type: 'spki', format: 'pem' }).toString();
    if (derivedPublic !== registeredPublic) throw new Error('Private key does not match registered public key');
    const signatureBase64 = sign(null, payload(record, signedAt), privateKey).toString('base64');
    const attestation: EvidenceAttestation = { recordId: record.id, recordHash: record.hash, signerId: record.signerId, keyId, algorithm: 'Ed25519', signedAt, signatureBase64 };
    this.accept(record, attestation);
    return structuredClone(attestation);
  }

  accept(record: CompetencyEvidenceRecord, attestation: EvidenceAttestation): void {
    if (attestation.recordId !== record.id || attestation.recordHash !== record.hash || attestation.signerId !== record.signerId) throw new Error('Attestation identity does not match evidence record');
    if (attestation.algorithm !== 'Ed25519') throw new Error('Unsupported evidence attestation algorithm');
    const key = this.requireUsableKey(attestation.keyId, attestation.signerId, attestation.signedAt);
    const signature = Buffer.from(attestation.signatureBase64, 'base64');
    if (!verify(null, payload(record, attestation.signedAt), createPublicKey(key.publicKeyPem), signature)) throw new Error('Invalid competency evidence signature');
    const existing = this.attestations.get(record.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(attestation)) throw new Error(`Evidence record already has a different accepted attestation: ${record.id}`);
    this.attestations.set(record.id, structuredClone(attestation));
  }

  isTrusted(record: CompetencyEvidenceRecord): boolean {
    const attestation = this.attestations.get(record.id);
    if (!attestation) return false;
    try { this.accept(record, attestation); return true; } catch { return false; }
  }

  requireTrusted(record: CompetencyEvidenceRecord): EvidenceAttestation {
    const attestation = this.attestations.get(record.id);
    if (!attestation) throw new Error(`Competency evidence is not cryptographically attested: ${record.id}`);
    this.accept(record, attestation);
    return structuredClone(attestation);
  }

  private requireUsableKey(keyId: string, signerId: string, at: string): TrustedEvidenceKey {
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Unknown evidence key: ${keyId}`);
    if (key.signerId !== signerId) throw new Error('Signing key is not authorized for evidence signer');
    if (key.status !== 'active') throw new Error('Signing key is revoked');
    const timestamp = Date.parse(at);
    if (!Number.isFinite(timestamp)) throw new Error('Attestation timestamp is invalid');
    if (timestamp < Date.parse(key.validFrom) || (key.validUntil !== undefined && timestamp > Date.parse(key.validUntil))) throw new Error('Signing key is outside its validity window');
    return key;
  }
}
