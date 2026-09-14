import { VerificationStatus } from './profile';

export type KycDocumentType = 'aadhaar' | 'passport' | 'voter_id' | 'pan';

export interface KycVerification {
  id: string;
  userId: string;
  companionId?: string;
  documentType: KycDocumentType;
  documentNumberMasked: string;
  status: VerificationStatus;
  providerVerificationId?: string;
  rejectionReason?: string;
  reviewerAdminId?: string;
  submittedAt: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function maskDocumentNumber(type: KycDocumentType, rawNumber: string): string {
  const clean = rawNumber.replace(/[\s-]/g, '').trim();
  if (clean.length < 4) return '****';
  const lastFour = clean.slice(-4);
  const prefixLen = clean.length - 4;
  return `${'X'.repeat(prefixLen)}-${lastFour}`;
}
