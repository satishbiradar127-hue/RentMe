import { VerificationStatus } from '../models/profile';
import { KycDocumentType, maskDocumentNumber } from '../models/kyc';

export interface KycVerificationParams {
  userId: string;
  companionId?: string;
  documentType: KycDocumentType;
  documentNumber: string;
}

export interface KycVerificationResult {
  userId: string;
  companionId?: string;
  status: VerificationStatus;
  verificationId: string;
  verifiedAt: string;
  documentNumberMasked: string;
  rejectionReason?: string;
}

export interface KycProvider {
  submitVerification(params: KycVerificationParams): Promise<KycVerificationResult>;
  verifyIdentity(params: KycVerificationParams): Promise<KycVerificationResult>;
  checkStatus(userIdOrVerificationId: string): Promise<VerificationStatus>;
}

export class MockKycProvider implements KycProvider {
  public validateDocument(type: KycDocumentType, rawNumber: string): { valid: boolean; reason?: string } {
    const clean = rawNumber.replace(/[\s-]/g, '').trim().toUpperCase();
    if (!clean) return { valid: false, reason: 'Document number cannot be empty' };

    switch (type) {
      case 'aadhaar':
        // 12 numeric digits
        if (!/^\d{12}$/.test(clean)) {
          return { valid: false, reason: 'Aadhaar must be exactly 12 numeric digits' };
        }
        break;
      case 'pan':
        // 5 letters, 4 digits, 1 letter
        if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(clean)) {
          return { valid: false, reason: 'PAN format must be ABCDE1234F' };
        }
        break;
      case 'passport':
        // 1 letter followed by 7 digits
        if (!/^[A-Z]\d{7}$/.test(clean)) {
          return { valid: false, reason: 'Passport format must be a letter followed by 7 digits' };
        }
        break;
      case 'voter_id':
        // 3 letters followed by 7 digits
        if (!/^[A-Z]{3}\d{7}$/.test(clean)) {
          return { valid: false, reason: 'Voter ID format must be 3 letters followed by 7 digits' };
        }
        break;
      default:
        return { valid: false, reason: `Unsupported document type: ${type}` };
    }

    return { valid: true };
  }

  async submitVerification(params: KycVerificationParams): Promise<KycVerificationResult> {
    const validation = this.validateDocument(params.documentType, params.documentNumber);
    const masked = maskDocumentNumber(params.documentType, params.documentNumber);

    if (!validation.valid) {
      return {
        userId: params.userId,
        companionId: params.companionId,
        status: 'rejected',
        verificationId: `kyc_rej_${Date.now()}`,
        verifiedAt: new Date().toISOString(),
        documentNumberMasked: masked,
        rejectionReason: validation.reason
      };
    }

    // Valid documents are verified in sandbox/mock provider
    return {
      userId: params.userId,
      companionId: params.companionId,
      status: 'verified',
      verificationId: `kyc_mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      verifiedAt: new Date().toISOString(),
      documentNumberMasked: masked
    };
  }

  async verifyIdentity(params: KycVerificationParams): Promise<KycVerificationResult> {
    return this.submitVerification(params);
  }

  async checkStatus(userIdOrVerificationId: string): Promise<VerificationStatus> {
    return 'verified';
  }
}
